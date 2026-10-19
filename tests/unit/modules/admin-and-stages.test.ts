import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../../support/db-mock";
import { userRow } from "../../support/fixtures";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);
vi.mock("@/server/integrations/firebase", () => ({ getVehicleLocations: vi.fn(async () => new Map()) }));
vi.mock("@/server/integrations/google-maps", () => ({ getLocationName: vi.fn(async () => "Moi Avenue, Nairobi") }));

const admin = await import("@/server/modules/admin/admin.service");
const stages = await import("@/server/modules/stages/stages.service");
const vehicles = await import("@/server/modules/vehicles/vehicles");
const { getVehicleLocations } = await import("@/server/integrations/firebase");
const { createVehicleSchema, listUsersQuerySchema, createUserSchema } = await import(
  "@/server/modules/admin/admin.schemas"
);

beforeEach(() => resetDbMock());

describe("stage subscriptions", () => {
  it("requires a phone number before subscribing", async () => {
    dbMock.user.findUnique.mockResolvedValue({ phoneNumber: null } as never);
    await expect(stages.subscribe(4, 1)).rejects.toMatchObject({
      status: 400,
      message: "Please add a phone number to your profile to subscribe for alerts.",
    });
    expect(dbMock.stageSubscription.upsert).not.toHaveBeenCalled();
  });

  it("subscribes idempotently", async () => {
    dbMock.user.findUnique.mockResolvedValue({ phoneNumber: "+254712345678" } as never);
    dbMock.stage.findUnique.mockResolvedValue({ id: 1, name: "Kencom", latitude: 0, longitude: 0 } as never);
    await expect(stages.subscribe(4, 1)).resolves.toEqual({ message: "Successfully subscribed to alerts for Kencom." });
    expect(dbMock.stageSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_stageId: { userId: 4, stageId: 1 } } }),
    );
  });

  it("404s for unknown stages", async () => {
    dbMock.stage.findUnique.mockResolvedValue(null);
    await expect(stages.unsubscribe(4, 99)).rejects.toMatchObject({ status: 404 });
  });
});

describe("admin user management", () => {
  it("builds a case-insensitive search that excludes the current admin", () => {
    expect(admin.buildUserListWhere(1, { q: "pat", role: "Passenger" })).toEqual({
      id: { not: 1 },
      role: "Passenger",
      OR: [
        { name: { contains: "pat", mode: "insensitive" } },
        { email: { contains: "pat", mode: "insensitive" } },
      ],
    });
    expect(admin.buildUserListWhere(1, { q: "", role: undefined })).toEqual({ id: { not: 1 } });
  });

  it("parses list query params leniently", () => {
    expect(listUsersQuerySchema.parse({ limit: "500", offset: "-3", role: "Hacker", q: "  ada " })).toEqual({
      limit: 25,
      offset: 0,
      role: undefined,
      q: "ada",
    });
  });

  it("only lets admins create Admin or MatAdmin accounts", () => {
    const base = { name: "X", email: "x@example.com", password: "secret123" };
    expect(createUserSchema.safeParse({ ...base, role: "MatAdmin" }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...base, role: "Passenger" }).success).toBe(false);
  });

  it("blocking a user also invalidates their tokens", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 4 } as never);
    await admin.setUserDisabled(1, 4, true);
    const { data } = dbMock.user.update.mock.calls[0]![0];
    expect(data).toMatchObject({ disabled: true, tokensValidFrom: expect.any(Date) });
  });

  it("unblocking does not touch tokensValidFrom", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 4 } as never);
    await admin.setUserDisabled(1, 4, false);
    expect(dbMock.user.update.mock.calls[0]![0].data).toEqual({ disabled: false });
  });

  it("stops admins from blocking or deleting themselves", async () => {
    await expect(admin.setUserDisabled(1, 1, true)).rejects.toMatchObject({ status: 400 });
    await expect(admin.deleteUser(1, 1)).rejects.toMatchObject({ status: 400 });
    expect(dbMock.user.update).not.toHaveBeenCalled();
    expect(dbMock.user.deleteMany).not.toHaveBeenCalled();
  });

  it("never returns password hashes for created users", async () => {
    dbMock.user.create.mockResolvedValue(userRow({ id: 9, role: "MatAdmin", password: "$2b$10$hash" }));
    const { user } = await admin.createUser({ name: "Mo", email: "mo@example.com", password: "secret123", role: "MatAdmin" });
    expect(user).not.toHaveProperty("password");
  });
});

describe("vehicles", () => {
  it("normalises plate numbers and empty owners", () => {
    expect(createVehicleSchema.parse({ carId: " CAR_1 ", plateNumber: " kdh 420x ", ownerId: "" })).toEqual({
      carId: "CAR_1",
      plateNumber: "KDH 420X",
      ownerId: null,
    });
    expect(createVehicleSchema.parse({ carId: "C", plateNumber: "P", ownerId: "7" }).ownerId).toBe(7);
  });

  it("only assigns vehicles to Matatu admins", async () => {
    dbMock.user.findUnique.mockResolvedValue({ role: "Passenger" } as never);
    await expect(vehicles.createVehicle({ carId: "C", plateNumber: "P", ownerId: 4 })).rejects.toMatchObject({ status: 400 });
    dbMock.user.findUnique.mockResolvedValue(null);
    await expect(vehicles.createVehicle({ carId: "C", plateNumber: "P", ownerId: 4 })).rejects.toMatchObject({ status: 404 });
  });

  it("soft-deletes and unlinks the vehicle from every stage", async () => {
    dbMock.vehicle.findFirst.mockResolvedValue({ id: 3 } as never);
    await admin.deleteVehicle(3);
    expect(dbMock.stageVehicle.deleteMany).toHaveBeenCalledWith({ where: { vehicleId: 3 } });
    expect(dbMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { deletedAt: expect.any(Date), isAtStage: false },
    });
    expect(dbMock.vehicle.delete).not.toHaveBeenCalled();
  });

  it("builds live status rows from Firebase locations", async () => {
    dbMock.vehicle.findMany.mockResolvedValue([
      { id: 1, carId: "CAR_1", plateNumber: "KDH 1", stages: [{ stage: { name: "Westlands" } }, { stage: { name: "Archives" } }] },
      { id: 2, carId: "CAR_2", plateNumber: "KDH 2", stages: [] },
    ] as never);
    vi.mocked(getVehicleLocations).mockResolvedValue(
      new Map([["CAR_1", { latitude: -1.28, longitude: 36.82, gpsStatus: "fix" }]]),
    );

    const rows = await vehicles.liveVehicleStatus();

    expect(rows).toEqual([
      {
        id: 1,
        plateNumber: "KDH 1",
        status: "Online",
        gpsStatus: "fix",
        location: "Moi Avenue, Nairobi",
        latitude: -1.28,
        longitude: 36.82,
        route: "Archives - Westlands",
      },
      {
        id: 2,
        plateNumber: "KDH 2",
        status: "Offline",
        gpsStatus: null,
        location: "Offline",
        latitude: null,
        longitude: null,
        route: "Not Assigned",
      },
    ]);
    // Soft-deleted vehicles are excluded.
    expect(dbMock.vehicle.findMany.mock.calls[0]![0]!.where).toMatchObject({ deletedAt: null });
  });
});
