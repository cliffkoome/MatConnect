import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../support/db-mock";
import { userRow } from "../support/fixtures";

/**
 * Route-level tests: call the exported Next.js handlers directly with a NextRequest, with Prisma
 * and the Neon Auth session mocked. They check the HTTP contract (status codes, auth/role
 * enforcement, first-sign-in provisioning) end to end through route() → guard → service.
 */

vi.mock("@/server/db", async () => (await import("../support/db-mock")).dbModule);
vi.mock("@/server/integrations/firebase", () => ({
  getVehicleLocations: vi.fn(async () => new Map()),
  fetchVehicleLocations: vi.fn(async () => new Map()),
  primeVehicleLocations: vi.fn(),
  publishStageEtas: vi.fn(),
}));

// Neon Auth: the session comes from the request cookies via getSession(); handler() is the proxy.
const getSession = vi.fn();
const upstream = { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() };
vi.mock("@/server/auth/neon", () => ({ neonAuth: () => ({ getSession, handler: () => upstream }) }));

const ctx = <P extends Record<string, string>>(params = {} as P) => ({ params: Promise.resolve(params) });
const req = (path: string, init: { method?: string; body?: unknown; token?: string; ip?: string } = {}) => {
  const headers = new Headers({ "x-forwarded-for": init.ip ?? "10.0.0.1" });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
};

const signedOut = () => getSession.mockResolvedValue({ data: null, error: null });

/** Signs the request in as this app user (already linked to a verified Neon Auth user). */
function signInAs(user: ReturnType<typeof userRow>, { emailVerified = true } = {}) {
  getSession.mockResolvedValue({
    data: {
      session: { id: "s1" },
      user: { id: user.authUserId ?? "auth-new", email: user.email, name: user.name, image: null, emailVerified },
    },
    error: null,
  });
  dbMock.user.findUnique.mockResolvedValue(user);
}

beforeEach(() => {
  resetDbMock();
  getSession.mockReset();
  signedOut();
});

describe("/api/auth/[...path] (Neon Auth proxy)", async () => {
  const route = await import("@/app/api/auth/[...path]/route");

  it("forwards every method to the Neon Auth handler", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"] as const) {
      upstream[method].mockResolvedValue(new Response(method));
      const context = { params: Promise.resolve({ path: ["sign-in", "email"] }) };
      const res = await route[method](req("/api/auth/sign-in/email", { method }), context);
      expect(await res.text()).toBe(method);
      expect(upstream[method]).toHaveBeenCalledWith(expect.any(Request), context);
    }
  });
});

describe("/api/auth/me", async () => {
  const { GET, PUT } = await import("@/app/api/auth/me/route");

  it("401s when signed out", async () => {
    const res = await GET(req("/api/auth/me"), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ message: "Access denied. Please sign in." });
  });

  it("403s until the email is verified", async () => {
    signInAs(userRow(), { emailVerified: false });
    const res = await GET(req("/api/auth/me"), ctx());
    expect(res.status).toBe(403);
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("creates the app user on first sign-in and returns the profile without internal ids", async () => {
    getSession.mockResolvedValue({
      data: { session: { id: "s1" }, user: { id: "auth-42", email: "pat@example.com", name: "Pat", image: null, emailVerified: true } },
      error: null,
    });
    const created = userRow({ id: 42, authUserId: "auth-42", email: "pat@example.com", name: "Pat" });
    // Not linked yet, no row with that email → created; then the profile read finds it.
    dbMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(created);
    dbMock.user.count.mockResolvedValue(3);
    dbMock.user.create.mockResolvedValue(created);

    const res = await GET(req("/api/auth/me"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: 42, email: "pat@example.com", role: "Passenger" });
    expect(body).not.toHaveProperty("authUserId");
    expect(dbMock.user.create.mock.calls[0]![0].data).toMatchObject({ authUserId: "auth-42", role: "Passenger" });
  });

  it("403s for a blocked account", async () => {
    signInAs(userRow({ disabled: true }));
    expect((await GET(req("/api/auth/me"), ctx())).status).toBe(403);
  });

  it("updates the signed-in user's own profile", async () => {
    signInAs(userRow({ id: 5 }));
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await PUT(req("/api/auth/me", { method: "PUT", body: { name: "New Name" } }), ctx());
    expect(res.status).toBe(200);
    expect(dbMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 5 }, data: { name: "New Name" } });
  });

  it("rate-limits after 100 requests per IP", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 101; i++) last = await GET(req("/api/auth/me", { ip: "203.0.113.50" }), ctx());
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBeTruthy();
  });
});

describe("role enforcement on /api/admin/*", async () => {
  const { GET } = await import("@/app/api/admin/users/route");

  it("401s when signed out", async () => {
    const res = await GET(req("/api/admin/users"), ctx());
    expect(res.status).toBe(401);
  });

  it("403s for a Passenger", async () => {
    signInAs(userRow({ id: 4, role: "Passenger" }));
    const res = await GET(req("/api/admin/users"), ctx());
    expect(res.status).toBe(403);
  });

  it("lets an Admin list users with pagination", async () => {
    signInAs(userRow({ id: 1, role: "Admin" }));
    dbMock.user.findMany.mockResolvedValue([
      { id: 2, name: "Pat", email: "pat@example.com", role: "Passenger", authUserId: "a2", disabled: false, createdAt: new Date(0) },
      { id: 3, name: "Owen", email: "owen@example.com", role: "MatAdmin", authUserId: null, disabled: false, createdAt: new Date(0) },
    ] as never);
    dbMock.user.count.mockResolvedValue(2);
    const res = await GET(req("/api/admin/users?q=pat&limit=10&offset=20"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.users.map((u: { activated: boolean }) => u.activated)).toEqual([true, false]);
    expect(body.users[0]).not.toHaveProperty("authUserId");
    expect(dbMock.user.findMany.mock.calls[0]![0]).toMatchObject({ take: 10, skip: 20 });
  });
});

describe("POST /api/admin/users", async () => {
  const { POST } = await import("@/app/api/admin/users/route");

  it("adds a user by email and role, with no password (Neon Auth owns passwords)", async () => {
    signInAs(userRow({ id: 1, role: "Admin" }));
    dbMock.user.create.mockResolvedValue(userRow({ id: 8, authUserId: null, email: "owner@example.com", role: "MatAdmin" }));
    const res = await POST(
      req("/api/admin/users", { method: "POST", body: { name: "Owner", email: "Owner@Example.com", role: "MatAdmin", password: "ignored" } }),
      ctx(),
    );
    expect(res.status).toBe(201);
    expect(dbMock.user.create).toHaveBeenCalledWith({ data: { name: "Owner", email: "owner@example.com", role: "MatAdmin" } });
  });
});

describe("dynamic params", async () => {
  const { DELETE } = await import("@/app/api/admin/stages/[stageId]/vehicles/[vehicleId]/route");
  const { GET: getEta } = await import("@/app/api/eta/[stageId]/route");

  it("validates numeric path params", async () => {
    signInAs(userRow({ id: 1, role: "Admin" }));
    const res = await DELETE(req("/api/admin/stages/abc/vehicles/1", { method: "DELETE" }), ctx({ stageId: "abc", vehicleId: "1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).errors[0]).toEqual({ field: "stageId", message: "Stage ID must be a positive integer" });
  });

  it("returns ETAs for a stage (Offline when there's no GPS fix)", async () => {
    signInAs(userRow({ id: 4 }));
    dbMock.stage.findUnique.mockResolvedValue({
      name: "Kencom",
      latitude: -1.28,
      longitude: 36.82,
      vehicles: [{ vehicle: { id: 1, carId: "CAR_1", plateNumber: "KDH 1", lastLatitude: null, lastLongitude: null } }],
    } as never);
    const res = await getEta(req("/api/eta/1"), ctx({ stageId: "1" }));
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
