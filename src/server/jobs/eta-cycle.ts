import "server-only";
import { db as defaultDb, type Db } from "@/server/db";
import { mergeVehicleStatus, type VehicleStatus } from "@/server/domain/eta";
import { MOVEMENT_THRESHOLD_M } from "@/server/domain/eta";
import { haversineDistance, type LatLng } from "@/server/domain/geo";
import { startOfUtcDay } from "@/server/domain/periods";
import {
  fetchVehicleLocations,
  primeVehicleLocations,
  publishStageEtas,
  type StageEtaPayload,
  type VehicleLocation,
} from "@/server/integrations/firebase";
import { getDirections } from "@/server/integrations/google-maps";
import { sendSms as defaultSendSms, type SmsResult } from "@/server/integrations/sms";
import { purgeExpiredRevocations } from "@/server/modules/auth/revocation";
import { calculateEtasForStage, visibleArrivals, type DirectionsFn } from "@/server/modules/eta/eta.service";
import { activeVehicle } from "@/server/modules/vehicles/vehicles";
import { acquireJobLock } from "./job-lock";

/**
 * The background ETA cycle (formerly cronService.js), run every ~30 s by either
 *  - Vercel Cron / any scheduler hitting POST /api/cron/eta-cycle, or
 *  - the in-process interval started from src/instrumentation.ts when self-hosting.
 *
 *  1. read every vehicle's GPS fix from Firebase (one call)
 *  2. compute ETAs per stage and publish them to Firebase `etas/<stage>`
 *  3. on arrival: count a trip (once per stay) and SMS one-shot subscribers
 *  4. clear `isAtStage` for vehicles that are no longer at any stage
 *  5. accumulate daily distance and remember the last position
 */

export const ETA_LOCK_NAME = "eta-cycle";
const LOCK_TTL_MS = 55_000;

export type EtaCycleDeps = {
  db: Db;
  fetchLocations: () => Promise<Map<string, VehicleLocation>>;
  publishEtas: (stageName: string, etas: StageEtaPayload) => Promise<void>;
  directions: DirectionsFn;
  sendSms: (to: string, message: string) => Promise<SmsResult>;
  now: () => Date;
  useLock: boolean;
};

export type EtaCycleReport =
  | { skipped: true; reason: string }
  | {
      skipped: false;
      stages: number;
      vehiclesOnline: number;
      arrivals: number;
      tripsCounted: number;
      smsSent: number;
      errors: number;
      durationMs: number;
    };

const defaultDeps = (): EtaCycleDeps => ({
  db: defaultDb,
  fetchLocations: fetchVehicleLocations,
  publishEtas: publishStageEtas,
  directions: getDirections,
  sendSms: defaultSendSms,
  now: () => new Date(),
  useLock: true,
});

let runningInProcess = false;

export async function runEtaCycle(overrides: Partial<EtaCycleDeps> = {}): Promise<EtaCycleReport> {
  const deps = { ...defaultDeps(), ...overrides };
  if (runningInProcess) return { skipped: true, reason: "already running in this process" };
  runningInProcess = true;
  let release: (() => Promise<void>) | null = null;
  try {
    if (deps.useLock) {
      release = await acquireJobLock(deps.db, ETA_LOCK_NAME, LOCK_TTL_MS);
      if (!release) return { skipped: true, reason: "another instance holds the lock" };
    }
    return await cycle(deps);
  } finally {
    runningInProcess = false;
    await release?.().catch((e) => console.error("[eta-cycle] failed to release lock", e));
  }
}

async function cycle(deps: EtaCycleDeps): Promise<EtaCycleReport> {
  const { db } = deps;
  const startedAt = Date.now();
  const report = { stages: 0, vehiclesOnline: 0, arrivals: 0, tripsCounted: 0, smsSent: 0, errors: 0 };

  // --- 1. Read phase ---------------------------------------------------------------------------
  const [stages, vehicles, locations] = await Promise.all([
    db.stage.findMany({
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        vehicles: {
          where: { vehicle: activeVehicle },
          select: {
            vehicle: { select: { id: true, carId: true, plateNumber: true, lastLatitude: true, lastLongitude: true } },
          },
        },
        subscribers: { select: { userId: true, user: { select: { phoneNumber: true } } } },
      },
    }),
    db.vehicle.findMany({
      where: activeVehicle,
      select: { id: true, carId: true, isAtStage: true, lastLatitude: true, lastLongitude: true },
    }),
    deps.fetchLocations(),
  ]);
  primeVehicleLocations(locations);
  report.stages = stages.length;
  report.vehiclesOnline = vehicles.filter((v) => locations.has(v.carId)).length;

  const finalStatus = new Map<number, VehicleStatus>();
  const today = startOfUtcDay(deps.now());

  // --- 2. Calculation + arrival phase ----------------------------------------------------------
  for (const stage of stages) {
    try {
      const etas = await calculateEtasForStage(
        stage,
        stage.vehicles.map((v) => v.vehicle),
        locations,
        deps.directions,
      );
      for (const eta of etas) mergeVehicleStatus(finalStatus, eta.id, eta.status);

      const payload: StageEtaPayload = Object.fromEntries(
        visibleArrivals(etas).map((e) => [e.carId, { plateNumber: e.plateNumber, eta: e.eta, status: e.status }]),
      );
      await deps.publishEtas(stage.name, payload);

      for (const arrived of etas.filter((e) => e.status === "Arrived")) {
        report.arrivals += 1;
        if (await countTripOnce(db, arrived.id, today)) report.tripsCounted += 1;
        report.smsSent += await notifySubscribers(deps, stage, arrived.plateNumber);
      }
    } catch (error) {
      report.errors += 1;
      console.error(`[eta-cycle] stage "${stage.name}" failed`, error);
    }
  }

  // --- 3. Reset vehicles that have left every stage --------------------------------------------
  const leftStage = vehicles.filter((v) => v.isAtStage && finalStatus.get(v.id) !== "Arrived").map((v) => v.id);
  if (leftStage.length) {
    await db.vehicle.updateMany({ where: { id: { in: leftStage } }, data: { isAtStage: false } });
  }

  // --- 4. Distance + last-known-position phase -------------------------------------------------
  for (const vehicle of vehicles) {
    const location = locations.get(vehicle.carId);
    if (!location) continue;
    try {
      await trackDistance(db, vehicle, location, today);
    } catch (error) {
      report.errors += 1;
      console.error(`[eta-cycle] distance update failed for vehicle ${vehicle.id}`, error);
    }
  }

  await purgeExpiredRevocations(deps.now()).catch((e) => console.error("[eta-cycle] revocation purge failed", e));

  return { skipped: false, ...report, durationMs: Date.now() - startedAt };
}

/**
 * Atomically flips isAtStage false→true; only the run that wins the flip counts the trip, so a
 * vehicle parked at a stage for several cycles (or seen by two instances) is counted once.
 */
export async function countTripOnce(db: Db, vehicleId: number, date: Date): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.vehicle.updateMany({
      where: { id: vehicleId, isAtStage: false },
      data: { isAtStage: true },
    });
    if (count === 0) return false;
    await tx.dailyTrip.upsert({
      where: { vehicleId_date: { vehicleId, date } },
      create: { vehicleId, date, tripCount: 1 },
      update: { tripCount: { increment: 1 } },
    });
    return true;
  });
}

type StageWithSubscribers = {
  id: number;
  name: string;
  subscribers: { userId: number; user: { phoneNumber: string | null } }[];
};

/** One-shot alerts: a subscriber is removed only after Africa's Talking accepts the SMS. */
async function notifySubscribers(deps: EtaCycleDeps, stage: StageWithSubscribers, plateNumber: string) {
  let sent = 0;
  const pending = stage.subscribers.filter((s) => s.user.phoneNumber);
  const results = await Promise.allSettled(
    pending.map(async (subscriber) => {
      // Re-check: an earlier arrival in this same cycle may already have consumed the subscription.
      const stillSubscribed = await deps.db.stageSubscription.count({
        where: { userId: subscriber.userId, stageId: stage.id },
      });
      if (!stillSubscribed) return;
      const result = await deps.sendSms(
        subscriber.user.phoneNumber!,
        `Matatu ${plateNumber} has arrived at ${stage.name}.`,
      );
      if (result.status === "sent") {
        await deps.db.stageSubscription.deleteMany({ where: { userId: subscriber.userId, stageId: stage.id } });
        sent += 1;
      } else {
        console.warn(`[eta-cycle] SMS to user ${subscriber.userId} ${result.status}; keeping subscription.`);
      }
    }),
  );
  for (const r of results) if (r.status === "rejected") console.error("[eta-cycle] SMS failed", r.reason);
  return sent;
}

type TrackedVehicle = { id: number; lastLatitude: number | null; lastLongitude: number | null };

/**
 * Adds movement since the last remembered position to today's distance. Movement under the drift
 * threshold is ignored *without* moving the baseline, so slow creeping still accumulates.
 */
export async function trackDistance(db: Db, vehicle: TrackedVehicle, current: LatLng, date: Date) {
  const { lastLatitude, lastLongitude } = vehicle;
  if (lastLatitude == null || lastLongitude == null) {
    await db.vehicle.update({
      where: { id: vehicle.id },
      data: { lastLatitude: current.latitude, lastLongitude: current.longitude },
    });
    return 0;
  }

  const moved = haversineDistance({ latitude: lastLatitude, longitude: lastLongitude }, current);
  if (moved <= MOVEMENT_THRESHOLD_M) return 0;

  await db.$transaction([
    db.dailyDistance.upsert({
      where: { vehicleId_date: { vehicleId: vehicle.id, date } },
      create: { vehicleId: vehicle.id, date, distanceCovered: moved },
      update: { distanceCovered: { increment: moved } },
    }),
    db.vehicle.update({
      where: { id: vehicle.id },
      data: { lastLatitude: current.latitude, lastLongitude: current.longitude },
    }),
  ]);
  return moved;
}
