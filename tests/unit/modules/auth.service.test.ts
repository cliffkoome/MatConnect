import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { dbMock, resetDbMock } from "../../support/db-mock";
import { identity, userRow } from "../../support/fixtures";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);

const auth = await import("@/server/modules/auth/auth.service");

beforeEach(() => {
  resetDbMock();
});

describe("linkAuthUser", () => {
  it("returns the already-linked user without writing", async () => {
    const linked = userRow({ id: 3 });
    dbMock.user.findUnique.mockResolvedValueOnce(linked);
    await expect(auth.linkAuthUser(identity())).resolves.toBe(linked);
    expect(dbMock.user.findUnique).toHaveBeenCalledWith({ where: { authUserId: "auth-user-1" } });
    expect(dbMock.user.create).not.toHaveBeenCalled();
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });

  it("makes the very first user an Admin", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(0);
    dbMock.user.create.mockImplementation((async ({ data }: { data: object }) => userRow({ ...data })) as never);
    const user = await auth.linkAuthUser(identity({ email: "Ada@Example.com" }));
    expect(user.role).toBe("Admin");
    expect(dbMock.user.create.mock.calls[0]![0].data).toMatchObject({
      authUserId: "auth-user-1",
      email: "ada@example.com",
      role: "Admin",
    });
  });

  it("makes everyone else a Passenger", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.count.mockResolvedValue(4);
    dbMock.user.create.mockImplementation((async ({ data }: { data: object }) => userRow({ ...data })) as never);
    await expect(auth.linkAuthUser(identity({ email: "pat@example.com" }))).resolves.toMatchObject({ role: "Passenger" });
  });

  it("links a user an Admin added by email, keeping their role", async () => {
    const invited = userRow({ id: 9, authUserId: null, email: "owner@example.com", role: "MatAdmin" });
    dbMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(invited);
    dbMock.user.update.mockImplementation((async ({ data }: { data: object }) => ({ ...invited, ...data })) as never);
    const user = await auth.linkAuthUser(identity({ id: "auth-9", email: "owner@example.com", image: "https://img" }));
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { authUserId: "auth-9", profilePictureUrl: "https://img" },
    });
    expect(user).toMatchObject({ id: 9, role: "MatAdmin", authUserId: "auth-9" });
    expect(dbMock.user.create).not.toHaveBeenCalled();
  });

  it("keeps an existing profile picture when linking", async () => {
    const invited = userRow({ id: 9, authUserId: null, profilePictureUrl: "/mine.jpg" });
    dbMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(invited);
    dbMock.user.update.mockResolvedValue(invited);
    await auth.linkAuthUser(identity({ image: "https://google" }));
    expect(dbMock.user.update.mock.calls[0]![0].data).toMatchObject({ profilePictureUrl: "/mine.jpg" });
  });

  it("recovers when a concurrent first request already created the row", async () => {
    const created = userRow({ id: 11 });
    dbMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(created);
    dbMock.user.count.mockResolvedValue(1);
    dbMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );
    await expect(auth.linkAuthUser(identity())).resolves.toBe(created);
  });
});

describe("toPublicUser", () => {
  it("never exposes the Neon Auth user id", () => {
    expect(auth.toPublicUser(userRow())).not.toHaveProperty("authUserId");
  });
});

describe("updateProfile", () => {
  it("normalises the phone number", async () => {
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
    await auth.updateProfile(4, { phoneNumber: "0712 345 678" });
    expect(dbMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 4 }, data: { phoneNumber: "+254712345678" } });
  });

  it("clears the phone number with null", async () => {
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
    await auth.updateProfile(4, { phoneNumber: null });
    expect(dbMock.user.updateMany.mock.calls[0]![0].data).toEqual({ phoneNumber: null });
  });
});
