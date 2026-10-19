import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import {
  PERIODS,
  bucketByPeriod,
  metresToKm,
  periodRangeStart,
  startOfUtcDay,
  type Period,
} from "@/server/domain/periods";
import { notFound } from "@/server/http/errors";
import { feedbackSelect } from "@/server/modules/feedback/feedback.service";
import { activeVehicle, liveVehicleStatus, vehicleSummarySelect } from "@/server/modules/vehicles/vehicles";
import { id } from "@/server/validation/common";

export const periodQuerySchema = z.object({
  period: z.enum(PERIODS as [Period, ...Period[]]).catch("daily").default("daily"),
});

export const statsQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const vehicleIdParamSchema = z.object({ vehicleId: id("Vehicle ID") });

const ownedBy = (ownerId: number) => ({ ownerId, ...activeVehicle });

async function ownedVehicleIds(ownerId: number): Promise<number[]> {
  const rows = await db.vehicle.findMany({ where: ownedBy(ownerId), select: { id: true } });
  return rows.map((r) => r.id);
}

export const myVehicles = (ownerId: number) =>
  db.vehicle.findMany({ where: ownedBy(ownerId), orderBy: { plateNumber: "asc" }, select: vehicleSummarySelect });

export async function dashboardData(ownerId: number) {
  return { vehicles: await liveVehicleStatus({ ownerId }) };
}

export async function dashboardSummary(ownerId: number, now = new Date()) {
  const vehicleIds = await ownedVehicleIds(ownerId);
  const date = startOfUtcDay(now);
  const [distance, trips] = await Promise.all([
    db.dailyDistance.aggregate({ where: { vehicleId: { in: vehicleIds }, date }, _sum: { distanceCovered: true } }),
    db.dailyTrip.aggregate({ where: { vehicleId: { in: vehicleIds }, date }, _sum: { tripCount: true } }),
  ]);
  return {
    totalVehicles: vehicleIds.length,
    /** Metres, as before. */
    totalDistanceToday: distance._sum.distanceCovered ?? 0,
    totalTripsToday: trips._sum.tripCount ?? 0,
  };
}

/** Per-vehicle stats for one day (defaults to today, UTC) plus the five latest feedback entries. */
export async function vehicleStats(ownerId: number, day?: string, now = new Date()) {
  const date = day ? new Date(`${day}T00:00:00.000Z`) : startOfUtcDay(now);
  const vehicles = await db.vehicle.findMany({
    where: ownedBy(ownerId),
    orderBy: { plateNumber: "asc" },
    select: {
      ...vehicleSummarySelect,
      dailyDistances: { where: { date }, select: { distanceCovered: true } },
      dailyTrips: { where: { date }, select: { tripCount: true } },
      feedback: { orderBy: { createdAt: "desc" }, take: 5, select: feedbackSelect },
    },
  });

  return vehicles.map(({ dailyDistances, dailyTrips, feedback, ...vehicle }) => ({
    ...vehicle,
    date: date.toISOString().slice(0, 10),
    distanceKm: metresToKm(dailyDistances[0]?.distanceCovered ?? 0),
    trips: dailyTrips[0]?.tripCount ?? 0,
    recentFeedback: feedback,
  }));
}

async function periodSeries(vehicleIds: number[], period: Period, now: Date) {
  const since = periodRangeStart(period, now);
  const where = { vehicleId: { in: vehicleIds }, date: { gte: since } };
  const [distances, trips] = await Promise.all([
    db.dailyDistance.findMany({ where, select: { date: true, distanceCovered: true } }),
    db.dailyTrip.findMany({ where, select: { date: true, tripCount: true } }),
  ]);
  return {
    distance: bucketByPeriod(
      distances.map((d) => ({ date: d.date, value: d.distanceCovered })),
      period,
    ).map((p) => ({ ...p, total: metresToKm(p.total) })),
    trips: bucketByPeriod(
      trips.map((t) => ({ date: t.date, value: t.tripCount })),
      period,
    ),
  };
}

export async function vehicleChartData(ownerId: number, vehicleId: number, period: Period, now = new Date()) {
  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, ...ownedBy(ownerId) }, select: { id: true } });
  if (!vehicle) throw notFound("Vehicle not found or you do not have permission to view it.");
  return periodSeries([vehicle.id], period, now);
}

/** `{ [period]: { distance (km), trips } }` across the whole fleet — used for the CSV report. */
export async function fleetAggregate(ownerId: number, period: Period, now = new Date()) {
  const vehicleIds = await ownedVehicleIds(ownerId);
  if (vehicleIds.length === 0) return {};
  const { distance, trips } = await periodSeries(vehicleIds, period, now);
  return combineSeries(distance, trips);
}

export function combineSeries(
  distance: { period: string; total: number }[],
  trips: { period: string; total: number }[],
): Record<string, { distance: number; trips: number }> {
  const periods = [...new Set([...distance.map((d) => d.period), ...trips.map((t) => t.period)])].sort();
  return Object.fromEntries(
    periods.map((p) => [
      p,
      {
        distance: distance.find((d) => d.period === p)?.total ?? 0,
        trips: trips.find((t) => t.period === p)?.total ?? 0,
      },
    ]),
  );
}
