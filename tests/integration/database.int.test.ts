import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { errorResponse } from "@/server/http/route";
import { countTripOnce, trackDistance } from "@/server/jobs/eta-cycle";
import { acquireJobLock } from "@/server/jobs/job-lock";
import { isRevoked, purgeExpiredRevocations, revokeToken } from "@/server/modules/auth/revocation";

/**
 * Runs against a real, migrated database (`npm run db:migrate:deploy` first).
 * These cover what mocks can't: SQL in raw queries, constraints from the migration, upsert/increment
 * atomicity and the job lease.
 */

const TODAY = new Date("2026-10-19T00:00:00Z");

async function truncateAll() {
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE "feedback", "daily_trips", "daily_distances", "stage_subscriptions", "stage_vehicles",
                   "vehicles", "stages", "users", "revoked_tokens", "job_locks"
    RESTART IDENTITY CASCADE`);
}

async function seedVehicle() {
  const owner = await db.user.create({ data: { name: "Mo", email: "mo@example.com", role: "MatAdmin" } });
  return db.vehicle.create({ data: { carId: "CAR_1", plateNumber: "KDH 1", ownerId: owner.id } });
}

beforeEach(truncateAll);
afterAll(async () => {
  await truncateAll();
  await db.$disconnect();
});

describe("migration constraints", () => {
  it("enforces unique emails and maps the violation to a 409 naming the field", async () => {
    await db.user.create({ data: { name: "A", email: "a@example.com" } });
    const error = await db.user.create({ data: { name: "B", email: "a@example.com" } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    const res = errorResponse(error);
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe("A record with this email already exists.");
  });

  it("rejects feedback ratings outside 1–5 (CHECK constraint)", async () => {
    const vehicle = await seedVehicle();
    const user = await db.user.create({ data: { name: "P", email: "p@example.com" } });
    await expect(db.feedback.create({ data: { vehicleId: vehicle.id, userId: user.id, rating: 6 } })).rejects.toThrow();
    await expect(db.feedback.create({ data: { vehicleId: vehicle.id, userId: user.id, rating: 5 } })).resolves.toBeTruthy();
  });

  it("nulls vehicle ownership when the owner is deleted, and cascades history when a vehicle is", async () => {
    const vehicle = await seedVehicle();
    await db.dailyTrip.create({ data: { vehicleId: vehicle.id, date: TODAY, tripCount: 2 } });
    await db.user.delete({ where: { id: vehicle.ownerId! } });
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).ownerId).toBeNull();
    await db.vehicle.delete({ where: { id: vehicle.id } });
    expect(await db.dailyTrip.count()).toBe(0);
  });

  it("stores timestamps as the real instant, whatever the server's TimeZone setting", async () => {
    const before = Date.now();
    const user = await db.user.create({ data: { name: "T", email: "t@example.com" } });
    const [{ server_now }] = (await db.$queryRaw<{ server_now: Date }[]>`SELECT now() AS server_now`) as [{ server_now: Date }];
    expect(Math.abs(user.createdAt.getTime() - before)).toBeLessThan(60_000);
    const [{ created }] = (await db.$queryRaw<{ created: Date }[]>`
      SELECT created_at AS created FROM users WHERE id = ${user.id}`) as [{ created: Date }];
    expect(Math.abs(created.getTime() - server_now.getTime())).toBeLessThan(60_000);
  });

  it("stores DATE columns as whole UTC days", async () => {
    const vehicle = await seedVehicle();
    await db.dailyDistance.create({ data: { vehicleId: vehicle.id, date: new Date("2026-10-19T23:59:00Z") } });
    const row = await db.dailyDistance.findFirstOrThrow();
    expect(row.date.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
});

describe("ETA cycle persistence", () => {
  it("counts exactly one trip when two runs race on the same arrival", async () => {
    const vehicle = await seedVehicle();
    const results = await Promise.all([countTripOnce(db, vehicle.id, TODAY), countTripOnce(db, vehicle.id, TODAY)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.dailyTrip.findFirstOrThrow()).tripCount).toBe(1);

    // Leave and arrive again → second trip on the same day.
    await db.vehicle.update({ where: { id: vehicle.id }, data: { isAtStage: false } });
    await countTripOnce(db, vehicle.id, TODAY);
    expect((await db.dailyTrip.findFirstOrThrow()).tripCount).toBe(2);
  });

  it("accumulates distance with upsert + increment", async () => {
    const vehicle = await seedVehicle();
    const a = { latitude: -1.3, longitude: 36.8 };
    const b = { latitude: -1.299, longitude: 36.8 };
    const c = { latitude: -1.298, longitude: 36.8 };
    await trackDistance(db, { id: vehicle.id, lastLatitude: null, lastLongitude: null }, a, TODAY);
    const m1 = await trackDistance(db, { id: vehicle.id, lastLatitude: a.latitude, lastLongitude: a.longitude }, b, TODAY);
    const m2 = await trackDistance(db, { id: vehicle.id, lastLatitude: b.latitude, lastLongitude: b.longitude }, c, TODAY);
    const row = await db.dailyDistance.findFirstOrThrow();
    expect(row.distanceCovered).toBeCloseTo(m1 + m2, 6);
    expect((await db.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).lastLatitude).toBe(c.latitude);
  });
});

describe("job lease", () => {
  it("is exclusive until released or expired", async () => {
    const release = await acquireJobLock(db, "test-job", 60_000, "holder-a");
    expect(release).toBeTypeOf("function");
    expect(await acquireJobLock(db, "test-job", 60_000, "holder-b")).toBeNull();

    await release!();
    const again = await acquireJobLock(db, "test-job", 60_000, "holder-b");
    expect(again).toBeTypeOf("function");
  });

  it("can be taken over once the previous lease has expired", async () => {
    await acquireJobLock(db, "stale-job", 1, "crashed-holder");
    await new Promise((r) => setTimeout(r, 20));
    expect(await acquireJobLock(db, "stale-job", 60_000, "new-holder")).toBeTypeOf("function");
  });

  it("does not let a holder release someone else's lease", async () => {
    const releaseA = await acquireJobLock(db, "owned-job", 1, "holder-a");
    await new Promise((r) => setTimeout(r, 20));
    await acquireJobLock(db, "owned-job", 60_000, "holder-b"); // takes over the expired lease
    await releaseA!(); // stale holder tries to release
    expect(await acquireJobLock(db, "owned-job", 60_000, "holder-c")).toBeNull();
  });
});

describe("token revocation", () => {
  it("stores revocations until expiry and purges them afterwards", async () => {
    const future = Math.floor(Date.now() / 1000) + 60;
    await revokeToken("jti-1", future);
    await revokeToken("jti-1", future); // idempotent
    await revokeToken("jti-expired", Math.floor(Date.now() / 1000) - 1); // already expired: not stored
    expect(await isRevoked("jti-1")).toBe(true);
    expect(await isRevoked("jti-expired")).toBe(false);

    expect(await purgeExpiredRevocations(new Date((future + 1) * 1000))).toBe(1);
    expect(await isRevoked("jti-1")).toBe(false);
  });
});
