import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../../support/db-mock";
import { userRow } from "../../support/fixtures";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);

// Stand-in for Neon Auth's cookie session lookup.
const getSession = vi.fn();
vi.mock("@/server/auth/neon", () => ({ neonAuth: () => ({ getSession }) }));

const { authenticate, currentIdentity } = await import("@/server/auth/guard");

const sessionUser = (overrides: Record<string, unknown> = {}) => ({
  data: {
    session: { id: "s1" },
    user: { id: "auth-user-1", email: "ada@example.com", name: "Ada", image: null, emailVerified: true, ...overrides },
  },
  error: null,
});

beforeEach(() => {
  resetDbMock();
  getSession.mockReset();
});

describe("currentIdentity", () => {
  it("is null when signed out", async () => {
    getSession.mockResolvedValue({ data: null, error: null });
    await expect(currentIdentity()).resolves.toBeNull();
  });

  it("maps the Neon Auth session user", async () => {
    getSession.mockResolvedValue(sessionUser({ image: "https://img" }));
    await expect(currentIdentity()).resolves.toEqual({
      id: "auth-user-1",
      email: "ada@example.com",
      name: "Ada",
      image: "https://img",
      emailVerified: true,
    });
  });
});

describe("authenticate", () => {
  it("rejects signed-out requests with 401", async () => {
    getSession.mockResolvedValue({ data: null, error: null });
    await expect(authenticate()).rejects.toMatchObject({ status: 401 });
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("requires a verified email before touching the users table", async () => {
    getSession.mockResolvedValue(sessionUser({ emailVerified: false }));
    await expect(authenticate()).rejects.toMatchObject({ status: 403, message: "Please verify your email address first." });
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns the linked app user and enforces the role", async () => {
    getSession.mockResolvedValue(sessionUser());
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 7, role: "Admin" }));
    await expect(authenticate("Admin")).resolves.toEqual({
      id: 7,
      authUserId: "auth-user-1",
      email: "ada@example.com",
      role: "Admin",
    });
    await expect(authenticate("Passenger")).rejects.toMatchObject({ status: 403 });
  });

  it("blocks a disabled user on their very next request", async () => {
    getSession.mockResolvedValue(sessionUser());
    dbMock.user.findUnique.mockResolvedValue(userRow({ disabled: true }));
    await expect(authenticate()).rejects.toMatchObject({ status: 403, message: "Account disabled" });
  });

  it("uses the current role from the database, not anything cached in the session", async () => {
    getSession.mockResolvedValue(sessionUser());
    dbMock.user.findUnique.mockResolvedValue(userRow({ role: "Passenger" }));
    await expect(authenticate("Admin")).rejects.toMatchObject({ status: 403 });
  });
});
