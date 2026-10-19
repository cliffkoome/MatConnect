import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../../support/db-mock";
import { userRow } from "../../support/fixtures";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);

const { authenticate, bearerToken } = await import("@/server/auth/guard");
const { tokens } = await import("@/server/auth/context");

const headers = (token?: string) => new Headers(token ? { authorization: `Bearer ${token}` } : {});

beforeEach(() => {
  resetDbMock();
  dbMock.revokedToken.findUnique.mockResolvedValue(null);
});

describe("bearerToken", () => {
  it("requires an Authorization header", () => {
    expect(() => bearerToken(new Headers())).toThrowError(expect.objectContaining({ status: 401 }));
  });
  it.each(["Basic abc", "Bearer", "Bearer a b"])("rejects malformed header %j with 400", (value) => {
    expect(() => bearerToken(new Headers({ authorization: value }))).toThrowError(
      expect.objectContaining({ status: 400, message: "Invalid token format" }),
    );
  });
});

describe("authenticate", () => {
  const admin = userRow({ id: 1, role: "Admin" });

  it("accepts a valid token and enforces the role", async () => {
    dbMock.user.findUnique.mockResolvedValue(admin);
    const token = await tokens().signAccess(admin);
    await expect(authenticate(headers(token), "Admin")).resolves.toMatchObject({ id: 1, role: "Admin" });
    await expect(authenticate(headers(token), "Passenger")).rejects.toMatchObject({ status: 403 });
  });

  it("rejects garbage tokens with 401", async () => {
    await expect(authenticate(headers("not.a.jwt"))).rejects.toMatchObject({ status: 401, message: "Invalid token" });
  });

  it("rejects revoked (logged-out) tokens", async () => {
    dbMock.user.findUnique.mockResolvedValue(admin);
    dbMock.revokedToken.findUnique.mockResolvedValue({ jti: "x" } as never);
    const token = await tokens().signAccess(admin);
    await expect(authenticate(headers(token))).rejects.toMatchObject({ status: 401, message: "Token has been invalidated" });
  });

  it("blocks a user immediately, even with a token minted before the block", async () => {
    const token = await tokens().signAccess(admin);
    dbMock.user.findUnique.mockResolvedValue({ ...admin, disabled: true });
    await expect(authenticate(headers(token))).rejects.toMatchObject({ status: 403, message: "Account disabled" });
  });

  it("rejects tokens issued before tokensValidFrom (password reset / block)", async () => {
    const token = await tokens().signAccess(admin);
    dbMock.user.findUnique.mockResolvedValue({ ...admin, tokensValidFrom: new Date(Date.now() + 10_000) });
    await expect(authenticate(headers(token))).rejects.toMatchObject({ status: 401 });
  });

  it("rejects tokens whose role no longer matches the account", async () => {
    const token = await tokens().signAccess(admin);
    dbMock.user.findUnique.mockResolvedValue({ ...admin, role: "Passenger" });
    await expect(authenticate(headers(token), "Admin")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects tokens for deleted users", async () => {
    const token = await tokens().signAccess(admin);
    dbMock.user.findUnique.mockResolvedValue(null);
    await expect(authenticate(headers(token))).rejects.toMatchObject({ status: 401 });
  });
});
