import "server-only";
import { db as defaultDb, type Db } from "@/server/db";
import { MOVEMENT_THRESHOLD_M, hasLeftAllStages } from "@/server/domain/eta";
import { haversineDistance, type LatLng } from "@/server/domain/geo";
import { businessDay } from "@/server/domain/periods";
import { env } from "@/server/env";
import {
  fetchVehicleLocations,
  primeVehicleLocations,
  publishStageEtas,
  type StageEtaPayload,
  type VehicleLocation,
} from "@/server/integrations/firebase";
import { getDirections } from "@/server/integrations/google-maps";
import { sendSms as defaultSendSms, type SmsResult } from "@/server/integrations/sms";
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
 *  4. clear `isAtStage` for vehicles that have clearly left every stage they serve
 *  5. accumulate daily distance and remember the last position
 *
 * The run must finish inside its lease, or a second instance could take the lease over and run
 * alongside it. So it works to a time budget shorter than the lease and stops starting new work
 * once the budget is spent. Stopping early is safe: unpublished ETAs are refreshed by the next run,
 * and distance is measured from the last *saved* position, so skipped movement is counted next time.
 */

export const ETA_LOCK_NAME = "eta-cycle";
export const LOCK_TTL_MS = 55_000;
/** Time left in the lease when a run stops starting new work (one stage or DB write fits easily). */
const LEASE_SAFETY_MARGIN_MS = 10_000;
export const DEFAULT_BUDGET_MS = LOCK_TTL_MS - LEASE_SAFETY_MARGIN_MS;

export type EtaCycleDeps = {
  db: Db;
  fetchLocations: () => Promise<Map<string, VehicleLocation>>;
  publishEtas: (stageName: string, etas: StageEtaPayload) => Promise<void>;
  directions: DirectionsFn;
  sendSms: (to: string, message: string) => Promise<SmsResult>;
  now: () => Date;
  useLock: boolean;
  /** Wall-clock time the run may use; never more than DEFAULT_BUDGET_MS (see the file comment). */
  budgetMs: number;
  /** IANA zone whose calendar day trips and distance are counted under. */
  timeZone: string;
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
      /** True if the time budget ran out and some stages or vehicles were left for the next run. */
      truncated: boolean;
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
  budgetMs: DEFAULT_BUDGET_MS,
  timeZone: env().APP_TIME_ZONE,
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
  const startedAt = deps.now().getTime();
  const deadline = startedAt + Math.min(deps.budgetMs, DEFAULT_BUDGET_MS);
  const outOfTime = () => deps.now().getTime() >= deadline;
  const report = {
    stages: 0,
    vehiclesOnline: 0,
    arrivals: 0,
    tripsCounted: 0,
    smsSent: 0,
    errors: 0,
    truncated: false,
  };

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
        subscribers: { select: { userId: true, createdAt: true, user: { select: { phoneNumber: true } } } },
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

  const today = businessDay(deps.now(), deps.timeZone);

  // --- 2. Calculation + arrival phase ----------------------------------------------------------
  for (const stage of stages) {
    if (outOfTime()) {
      report.truncated = true;
      break;
    }
    try {
      const etas = await calculateEtasForStage(
        stage,
        stage.vehicles.map((v) => v.vehicle),
        locations,
        deps.directions,
      );
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
  // Decided from geometry, not from this run's statuses: a stage that errored, a "No Route" from
  // Maps or a GPS dropout must not look like the vehicle drove off (it would be counted again).
  const stagesByVehicle = new Map<number, LatLng[]>();
  for (const stage of stages) {
    for (const { vehicle } of stage.vehicles) {
      const served = stagesByVehicle.get(vehicle.id) ?? [];
      served.push({ latitude: stage.latitude, longitude: stage.longitude });
      stagesByVehicle.set(vehicle.id, served);
    }
  }
  const leftStage = vehicles
    .filter((v) => v.isAtStage && hasLeftAllStages(locations.get(v.carId), stagesByVehicle.get(v.id) ?? []))
    .map((v) => v.id);
  if (leftStage.length) {
    await db.vehicle.updateMany({ where: { id: { in: leftStage } }, data: { isAtStage: false } });
  }

  // --- 4. Distance + last-known-position phase -------------------------------------------------
  for (const vehicle of vehicles) {
    const location = locations.get(vehicle.carId);
    if (!location) continue;
    if (outOfTime()) {
      report.truncated = true;
      break;
    }
    try {
      await trackDistance(db, vehicle, location, today);
    } catch (error) {
      report.errors += 1;
      console.error(`[eta-cycle] distance update failed for vehicle ${vehicle.id}`, error);
    }
  }

  if (report.truncated) console.warn("[eta-cycle] time budget spent; the rest is left for the next run");
  return { skipped: false, ...report, durationMs: deps.now().getTime() - startedAt };
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
  subscribers: { userId: number; createdAt: Date; user: { phoneNumber: string | null } }[];
};

/**
 * One-shot alerts, claim-then-send: deleting the subscription row *is* the claim, and only the
 * caller whose delete removed it sends. Two overlapping runs, or two vehicles arriving in the same
 * run, can therefore never text the same person twice. If the SMS isn't accepted the row is put
 * back (with its original created_at), so the next arrival retries it.
 *
 * The one gap is a crash between the claim and the send, which loses that alert. A duplicate
 * "your matatu is here" text is worse for the passenger than a rare missed one, and the old
 * send-then-delete order had the opposite gap plus duplicates under overlap.
 */
async function notifySubscribers(deps: EtaCycleDeps, stage: StageWithSubscribers, plateNumber: string) {
  let sent = 0;
  const pending = stage.subscribers.filter((s) => s.user.phoneNumber);
  const results = await Promise.allSettled(
    pending.map(async (subscriber) => {
      const key = { userId: subscriber.userId, stageId: stage.id };
      const { count: claimed } = await deps.db.stageSubscription.deleteMany({ where: key });
      if (claimed === 0) return; // already alerted, or they unsubscribed

      const result = await deps
        .sendSms(subscriber.user.phoneNumber!, `Matatu ${plateNumber} has arrived at ${stage.name}.`)
        .catch((error: unknown) => {
          console.error(`[eta-cycle] SMS to user ${subscriber.userId} threw`, error);
          return { status: "failed" as const, raw: null };
        });
      if (result.status === "sent") {
        sent += 1;
        return;
      }
      console.warn(`[eta-cycle] SMS to user ${subscriber.userId} ${result.status}; restoring subscription.`);
      await deps.db.stageSubscription.createMany({
        data: [{ ...key, createdAt: subscriber.createdAt }],
        skipDuplicates: true,
      });
    }),
  );
  for (const r of results) if (r.status === "rejected") console.error("[eta-cycle] alert bookkeeping failed", r.reason);
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
