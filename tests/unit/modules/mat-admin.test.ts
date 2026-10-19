import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../../support/db-mock";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);
vi.mock("@/server/integrations/firebase", () => ({ getVehicleLocations: vi.fn(async () => new Map()) }));
vi.mock("@/server/integrations/google-maps", () => ({ getLocationName: vi.fn() }));

const mat = await import("@/server/modules/mat-admin/mat-admin.service");

const NOW = new Date("2026-10-19T09:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

beforeEach(() => resetDbMock());

describe("vehicleChartData", () => {
  it("404s for vehicles the Matatu admin doesn't own", async () => {
    dbMock.vehicle.findFirst.mockResolvedValue(null);
    await expect(mat.vehicleChartData(3, 99, "daily", NOW)).rejects.toMatchObject({ status: 404 });
    expect(dbMock.vehicle.findFirst.mock.calls[0]![0]!.where).toMatchObject({ id: 99, ownerId: 3, deletedAt: null });
  });

  it("returns distance in km and trips per period, from the right start date", async () => {
    dbMock.vehicle.findFirst.mockResolvedValue({ id: 1 } as never);
    dbMock.dailyDistance.findMany.mockResolvedValue([
      { date: day("2026-10-13"), distanceCovered: 12_345 },
      { date: day("2026-10-19"), distanceCovered: 1_000 },
    ] as never);
    dbMock.dailyTrip.findMany.mockResolvedValue([{ date: day("2026-10-19"), tripCount: 4 }] as never);

    const data = await mat.vehicleChartData(3, 1, "daily", NOW);

    expect(data).toEqual({
      distance: [
        { period: "2026-10-13", total: 12.35 },
        { period: "2026-10-19", total: 1 },
      ],
      trips: [{ period: "2026-10-19", total: 4 }],
    });
    expect(dbMock.dailyDistance.findMany.mock.calls[0]![0]!.where).toEqual({
      vehicleId: { in: [1] },
      date: { gte: day("2026-10-13") },
    });
  });
});

describe("fleetAggregate", () => {
  it("is empty when the admin has no vehicles", async () => {
    dbMock.vehicle.findMany.mockResolvedValue([]);
    await expect(mat.fleetAggregate(3, "weekly", NOW)).resolves.toEqual({});
    expect(dbMock.dailyDistance.findMany).not.toHaveBeenCalled();
  });

  it("combines distance and trips per ISO week", async () => {
    dbMock.vehicle.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
    dbMock.dailyDistance.findMany.mockResolvedValue([
      { date: day("2026-10-12"), distanceCovered: 5_000 },
      { date: day("2026-10-14"), distanceCovered: 5_000 },
      { date: day("2026-10-19"), distanceCovered: 2_500 },
    ] as never);
    dbMock.dailyTrip.findMany.mockResolvedValue([{ date: day("2026-10-13"), tripCount: 7 }] as never);

    await expect(mat.fleetAggregate(3, "weekly", NOW)).resolves.toEqual({
      "2026-W42": { distance: 10, trips: 7 },
      "2026-W43": { distance: 2.5, trips: 0 },
    });
  });
});

describe("dashboardSummary", () => {
  it("sums today's distance (metres) and trips across owned vehicles", async () => {
    dbMock.vehicle.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
    dbMock.dailyDistance.aggregate.mockResolvedValue({ _sum: { distanceCovered: 4_200 } } as never);
    dbMock.dailyTrip.aggregate.mockResolvedValue({ _sum: { tripCount: null } } as never);

    await expect(mat.dashboardSummary(3, NOW)).resolves.toEqual({
      totalVehicles: 2,
      totalDistanceToday: 4_200,
      totalTripsToday: 0,
    });
    expect(dbMock.dailyDistance.aggregate.mock.calls[0]![0]!.where).toEqual({
      vehicleId: { in: [1, 2] },
      date: day("2026-10-19"),
    });
  });
});

describe("query schemas", () => {
  it("defaults unknown periods to daily", () => {
    expect(mat.periodQuerySchema.parse({ period: "hourly" })).toEqual({ period: "daily" });
    expect(mat.periodQuerySchema.parse({})).toEqual({ period: "daily" });
    expect(mat.periodQuerySchema.parse({ period: "monthly" })).toEqual({ period: "monthly" });
  });

  it("ignores malformed dates", () => {
    expect(mat.statsQuerySchema.parse({ date: "19/10/2026" })).toEqual({ date: undefined });
    expect(mat.statsQuerySchema.parse({ date: "2026-10-19" })).toEqual({ date: "2026-10-19" });
  });
});
