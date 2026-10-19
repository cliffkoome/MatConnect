import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Directions } from "@/server/domain/eta";
import type { VehicleLocation } from "@/server/integrations/firebase";
import { dbMock, resetDbMock } from "../../support/db-mock";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);
vi.mock("@/server/integrations/firebase", () => ({
  fetchVehicleLocations: vi.fn(),
  primeVehicleLocations: vi.fn(),
  publishStageEtas: vi.fn(),
  getVehicleLocations: vi.fn(),
}));
vi.mock("@/server/integrations/google-maps", () => ({ getDirections: vi.fn(), getLocationName: vi.fn() }));
vi.mock("@/server/integrations/sms", () => ({ sendSms: vi.fn() }));

const { runEtaCycle, countTripOnce, trackDistance } = await import("@/server/jobs/eta-cycle");

const NOW = new Date("2026-10-19T09:00:00Z");
const TODAY = new Date("2026-10-19T00:00:00Z");
const stagePos = { latitude: -1.2833, longitude: 36.8167 };
const near = { latitude: stagePos.latitude - 0.0002, longitude: stagePos.longitude }; // ~22 m away

const leg = (metres: number): Directions => ({
  distance: { value: metres, text: `${metres} m` },
  duration: { value: 60, text: "1 min" },
});

function setupWorld({ isAtStage = false, phone = "+254712345678" as string | null } = {}) {
  dbMock.stage.findMany.mockResolvedValue([
    {
      id: 1,
      name: "Kencom",
      ...stagePos,
      vehicles: [{ vehicle: { id: 10, carId: "CAR_10", plateNumber: "KDH 10", lastLatitude: null, lastLongitude: null } }],
      subscribers: [{ userId: 4, user: { phoneNumber: phone } }],
    },
  ] as never);
  dbMock.vehicle.findMany.mockResolvedValue([
    { id: 10, carId: "CAR_10", isAtStage, lastLatitude: null, lastLongitude: null },
  ] as never);
  dbMock.stageSubscription.count.mockResolvedValue(1);
  dbMock.vehicle.updateMany.mockResolvedValue({ count: isAtStage ? 0 : 1 });
  dbMock.revokedToken.deleteMany.mockResolvedValue({ count: 0 });
}

function deps(overrides: Partial<Parameters<typeof runEtaCycle>[0]> = {}) {
  return {
    db: dbMock,
    fetchLocations: vi.fn(async () => new Map<string, VehicleLocation>([["CAR_10", near]])),
    publishEtas: vi.fn(async () => {}),
    directions: vi.fn(async () => leg(20)),
    sendSms: vi.fn(async () => ({ status: "sent" as const, statusCode: 101, raw: {} })),
    now: () => NOW,
    useLock: false,
    ...overrides,
  };
}

beforeEach(() => resetDbMock());

describe("runEtaCycle", () => {
  it("on arrival: counts one trip, texts the subscriber, and removes the one-shot subscription", async () => {
    setupWorld();
    const d = deps();

    const report = await runEtaCycle(d);

    expect(report).toMatchObject({ skipped: false, stages: 1, vehiclesOnline: 1, arrivals: 1, tripsCounted: 1, smsSent: 1, errors: 0 });
    expect(d.publishEtas).toHaveBeenCalledWith("Kencom", {
      CAR_10: { plateNumber: "KDH 10", eta: "Arrived", status: "Arrived" },
    });
    expect(dbMock.dailyTrip.upsert).toHaveBeenCalledWith({
      where: { vehicleId_date: { vehicleId: 10, date: TODAY } },
      create: { vehicleId: 10, date: TODAY, tripCount: 1 },
      update: { tripCount: { increment: 1 } },
    });
    expect(d.sendSms).toHaveBeenCalledWith("+254712345678", "Matatu KDH 10 has arrived at Kencom.");
    expect(dbMock.stageSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: 4, stageId: 1 } });
  });

  it("does not count a second trip while the vehicle stays at the stage", async () => {
    setupWorld({ isAtStage: true });
    const report = await runEtaCycle(deps());
    expect(report).toMatchObject({ arrivals: 1, tripsCounted: 0 });
    expect(dbMock.dailyTrip.upsert).not.toHaveBeenCalled();
  });

  it("keeps the subscription when the SMS is not accepted", async () => {
    setupWorld();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await runEtaCycle(deps({ sendSms: vi.fn(async () => ({ status: "failed" as const, raw: {} })) }));
    expect(report).toMatchObject({ smsSent: 0 });
    expect(dbMock.stageSubscription.deleteMany).not.toHaveBeenCalled();
  });

  it("skips subscribers without a phone number", async () => {
    setupWorld({ phone: null });
    const d = deps();
    await runEtaCycle(d);
    expect(d.sendSms).not.toHaveBeenCalled();
  });

  it("resets isAtStage once the vehicle has left every stage, and hides 'Departed'/'Too Far' from passengers", async () => {
    setupWorld({ isAtStage: true });
    const d = deps({ directions: vi.fn(async () => leg(900)) });

    await runEtaCycle(d);

    expect(dbMock.vehicle.updateMany).toHaveBeenCalledWith({ where: { id: { in: [10] } }, data: { isAtStage: false } });
    expect(d.sendSms).not.toHaveBeenCalled();
    expect(d.publishEtas).toHaveBeenCalledWith("Kencom", {
      CAR_10: { plateNumber: "KDH 10", eta: "1 min", status: "Approaching" },
    });
  });

  it("isolates a failing stage and keeps going", async () => {
    setupWorld();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await runEtaCycle(deps({ publishEtas: vi.fn(async () => Promise.reject(new Error("firebase down"))) }));
    expect(report).toMatchObject({ skipped: false, errors: 1 });
    // The distance phase still ran (first sighting records the baseline position).
    expect(dbMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { lastLatitude: near.latitude, lastLongitude: near.longitude },
    });
  });

  it("skips when another instance holds the job lease", async () => {
    dbMock.$executeRaw.mockResolvedValue(0);
    const d = deps({ useLock: true });
    await expect(runEtaCycle(d)).resolves.toEqual({ skipped: true, reason: "another instance holds the lock" });
    expect(d.fetchLocations).not.toHaveBeenCalled();
  });

  it("takes and releases the lease around a run", async () => {
    setupWorld();
    dbMock.$executeRaw.mockResolvedValue(1);
    await runEtaCycle(deps({ useLock: true }));
    expect(dbMock.$executeRaw).toHaveBeenCalledTimes(2); // acquire + release
  });
});

describe("countTripOnce", () => {
  it("only counts when it wins the isAtStage false→true flip", async () => {
    dbMock.vehicle.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(countTripOnce(dbMock, 10, TODAY)).resolves.toBe(true);
    await expect(countTripOnce(dbMock, 10, TODAY)).resolves.toBe(false);
    expect(dbMock.dailyTrip.upsert).toHaveBeenCalledTimes(1);
    expect(dbMock.vehicle.updateMany).toHaveBeenCalledWith({ where: { id: 10, isAtStage: false }, data: { isAtStage: true } });
  });
});

describe("trackDistance", () => {
  const start = { latitude: -1.3, longitude: 36.8 };

  it("records the first sighting as the baseline", async () => {
    await expect(trackDistance(dbMock, { id: 1, lastLatitude: null, lastLongitude: null }, start, TODAY)).resolves.toBe(0);
    expect(dbMock.dailyDistance.upsert).not.toHaveBeenCalled();
  });

  it("ignores drift without moving the baseline", async () => {
    const drift = { latitude: start.latitude + 0.00005, longitude: start.longitude }; // ~5.5 m
    await expect(
      trackDistance(dbMock, { id: 1, lastLatitude: start.latitude, lastLongitude: start.longitude }, drift, TODAY),
    ).resolves.toBe(0);
    expect(dbMock.vehicle.update).not.toHaveBeenCalled();
  });

  it("adds real movement to today's total and moves the baseline", async () => {
    const moved = { latitude: start.latitude + 0.001, longitude: start.longitude }; // ~111 m
    const metres = await trackDistance(
      dbMock,
      { id: 1, lastLatitude: start.latitude, lastLongitude: start.longitude },
      moved,
      TODAY,
    );
    expect(metres).toBeGreaterThan(105);
    expect(metres).toBeLessThan(118);
    expect(dbMock.dailyDistance.upsert).toHaveBeenCalledWith({
      where: { vehicleId_date: { vehicleId: 1, date: TODAY } },
      create: { vehicleId: 1, date: TODAY, distanceCovered: metres },
      update: { distanceCovered: { increment: metres } },
    });
    expect(dbMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { lastLatitude: moved.latitude, lastLongitude: moved.longitude },
    });
  });
});
