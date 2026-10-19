import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../support/db-mock";
import { PASSWORD, passwordHash, userRow } from "../support/fixtures";

/**
 * Route-level tests: call the exported Next.js handlers directly with a NextRequest, with Prisma
 * mocked. They check the HTTP contract (status codes, cookies, auth/role enforcement) end to end
 * through route() → guard → service.
 */

vi.mock("@/server/db", async () => (await import("../support/db-mock")).dbModule);
vi.mock("@/server/integrations/firebase", () => ({
  getVehicleLocations: vi.fn(async () => new Map()),
  fetchVehicleLocations: vi.fn(async () => new Map()),
  primeVehicleLocations: vi.fn(),
  publishStageEtas: vi.fn(),
}));

const { tokens } = await import("@/server/auth/context");

const ctx = <P extends Record<string, string>>(params = {} as P) => ({ params: Promise.resolve(params) });
const req = (path: string, init: { method?: string; body?: unknown; token?: string; cookie?: string; ip?: string } = {}) => {
  const headers = new Headers({ "x-forwarded-for": init.ip ?? "10.0.0.1" });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
};

async function tokenFor(user: ReturnType<typeof userRow>) {
  dbMock.user.findUnique.mockResolvedValue(user);
  dbMock.revokedToken.findUnique.mockResolvedValue(null);
  return tokens().signAccess(user);
}

beforeEach(() => resetDbMock());

describe("POST /api/auth/login", async () => {
  const { POST } = await import("@/app/api/auth/login/route");

  it("returns the access token and sets an httpOnly refresh cookie scoped to /api/auth", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 2, password: await passwordHash() }));
    const res = await POST(req("/api/auth/login", { method: "POST", body: { email: "ADA@example.com ", password: PASSWORD } }), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: "Login successful", accessToken: expect.any(String), role: "Passenger" });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^refreshToken=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=lax/i);
    // Email was normalised before the lookup.
    expect(dbMock.user.findUnique).toHaveBeenCalledWith({ where: { email: "ada@example.com" } });
  });

  it("returns 400 with field errors for invalid input", async () => {
    const res = await POST(req("/api/auth/login", { method: "POST", body: { email: "nope" } }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.map((e: { field: string }) => e.field)).toEqual(["email", "password"]);
  });

  it("rate-limits after 100 attempts per IP", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    vi.spyOn(console, "error").mockImplementation(() => {});
    let last: Response | undefined;
    for (let i = 0; i < 101; i++) {
      last = await POST(req("/api/auth/login", { method: "POST", body: {}, ip: "203.0.113.50" }), ctx());
    }
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/auth/2fa/login", async () => {
  const { POST } = await import("@/app/api/auth/2fa/login/route");
  it("rejects malformed codes before touching the database", async () => {
    const res = await POST(req("/api/auth/2fa/login", { method: "POST", body: { tempToken: "x", token: "12ab" } }), ctx());
    expect(res.status).toBe(400);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/refresh-token", async () => {
  const { POST } = await import("@/app/api/auth/refresh-token/route");

  it("rotates the cookie", async () => {
    const user = userRow({ id: 3 });
    const access = await tokens().signAccess(user);
    const refresh = await tokens().signRefresh(3);
    dbMock.revokedToken.count.mockResolvedValue(0);
    dbMock.user.findUnique.mockResolvedValue(user);

    const res = await POST(req("/api/auth/refresh-token", { method: "POST", token: access, cookie: `refreshToken=${refresh}` }), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).accessToken).toEqual(expect.any(String));
    const newCookie = res.headers.get("set-cookie")!;
    expect(newCookie).toMatch(/^refreshToken=/);
    expect(newCookie).not.toContain(refresh);
  });

  it("401s without the cookie", async () => {
    const res = await POST(req("/api/auth/refresh-token", { method: "POST" }), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Refresh token missing" });
  });
});

describe("POST /api/auth/logout", async () => {
  const { POST } = await import("@/app/api/auth/logout/route");
  it("revokes the access token and clears the cookie, even without a valid session", async () => {
    const access = await tokens().signAccess(userRow({ id: 3 }));
    const res = await POST(req("/api/auth/logout", { method: "POST", token: access }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/refreshToken=;.*Max-Age=0/i);
    expect(dbMock.revokedToken.upsert).toHaveBeenCalledTimes(1);

    const anonymous = await POST(req("/api/auth/logout", { method: "POST" }), ctx());
    expect(anonymous.status).toBe(200);
  });
});

describe("role enforcement on /api/admin/*", async () => {
  const { GET } = await import("@/app/api/admin/users/route");

  it("401s without a token", async () => {
    const res = await GET(req("/api/admin/users"), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Access denied. No token provided." });
  });

  it("403s for a Passenger", async () => {
    const token = await tokenFor(userRow({ id: 4, role: "Passenger" }));
    const res = await GET(req("/api/admin/users", { token }), ctx());
    expect(res.status).toBe(403);
  });

  it("lets an Admin list users with pagination", async () => {
    const token = await tokenFor(userRow({ id: 1, role: "Admin" }));
    dbMock.user.findMany.mockResolvedValue([]);
    dbMock.user.count.mockResolvedValue(0);
    const res = await GET(req("/api/admin/users?q=pat&limit=10&offset=20", { token }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [], total: 0 });
    expect(dbMock.user.findMany.mock.calls[0]![0]).toMatchObject({ take: 10, skip: 20 });
  });
});

describe("dynamic params", async () => {
  const { DELETE } = await import("@/app/api/admin/stages/[stageId]/vehicles/[vehicleId]/route");
  const { GET: getEta } = await import("@/app/api/eta/[stageId]/route");

  it("validates numeric path params", async () => {
    const token = await tokenFor(userRow({ id: 1, role: "Admin" }));
    const res = await DELETE(req("/api/admin/stages/abc/vehicles/1", { method: "DELETE", token }), ctx({ stageId: "abc", vehicleId: "1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0]).toEqual({ field: "stageId", message: "Stage ID must be a positive integer" });
  });

  it("returns ETAs for a stage (Offline when there's no GPS fix)", async () => {
    const token = await tokenFor(userRow({ id: 4 }));
    dbMock.stage.findUnique.mockResolvedValue({
      name: "Kencom",
      latitude: -1.28,
      longitude: 36.82,
      vehicles: [{ vehicle: { id: 1, carId: "CAR_1", plateNumber: "KDH 1", lastLatitude: null, lastLongitude: null } }],
    } as never);
    const res = await getEta(req("/api/eta/1", { token }), ctx({ stageId: "1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      stageName: "Kencom",
      arrivals: [{ id: 1, carId: "CAR_1", plateNumber: "KDH 1", eta: "N/A", status: "Offline" }],
    });
  });
});

describe("GET /api/cron/eta-cycle", async () => {
  const { GET } = await import("@/app/api/cron/eta-cycle/route");

  it("requires the cron secret", async () => {
    expect((await GET(req("/api/cron/eta-cycle"))).status).toBe(401);
    expect((await GET(req("/api/cron/eta-cycle", { token: "wrong-secret-of-same-len" }))).status).toBe(401);
  });

  it("runs a cycle with the right secret", async () => {
    dbMock.$executeRaw.mockResolvedValue(1);
    dbMock.stage.findMany.mockResolvedValue([]);
    dbMock.vehicle.findMany.mockResolvedValue([]);
    dbMock.revokedToken.deleteMany.mockResolvedValue({ count: 0 });
    const res = await GET(req("/api/cron/eta-cycle", { token: "test-cron-secret-123456" }));
    expect(res.status).toBe(200);
    expect((await res.json()).runs[0]).toMatchObject({ skipped: false, stages: 0 });
  });
});

describe("GET /api/health", async () => {
  const { GET } = await import("@/app/api/health/route");
  it("reports database reachability", async () => {
    dbMock.$queryRaw.mockResolvedValue([{ "?column?": 1 }] as never);
    expect((await GET()).status).toBe(200);

    vi.spyOn(console, "error").mockImplementation(() => {});
    dbMock.$queryRaw.mockRejectedValue(new Error("down"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "degraded", database: "unreachable" });
  });
});
