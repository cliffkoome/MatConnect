import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { HttpError, notFound } from "@/server/http/errors";
import { errorResponse, parseBody, parseQuery, route, uniqueFields } from "@/server/http/route";

vi.mock("@/server/auth/guard", () => ({ authenticate: vi.fn() }));

const knownError = (code: string, meta: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("db error", { code, clientVersion: "test", meta });

describe("errorResponse", () => {
  it("maps HttpError status, message, field errors and headers", async () => {
    const res = errorResponse(new HttpError(429, "slow", { headers: { "Retry-After": "5" } }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(await res.json()).toEqual({ message: "slow" });
  });

  it("maps Zod errors to 400 with per-field messages", async () => {
    const result = z.object({ email: z.email("Bad email"), age: z.number() }).safeParse({ email: "x" });
    const res = errorResponse(result.error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Validation failed");
    expect(body.errors).toEqual(
      expect.arrayContaining([
        { field: "email", message: "Bad email" },
        expect.objectContaining({ field: "age" }),
      ]),
    );
  });

  it("maps unique violations (driver-adapter shape) to 409 naming the field", async () => {
    const error = knownError("P2002", {
      modelName: "Vehicle",
      driverAdapterError: { cause: { kind: "UniqueConstraintViolation", table: "vehicles", constraint: { index: "vehicles_plate_number_key" } } },
    });
    const res = errorResponse(error);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      message: "A record with this plateNumber already exists.",
      errors: [{ field: "plateNumber", message: "plateNumber must be unique" }],
    });
  });

  it("maps P2025 to 404 and P2003 to 400", () => {
    expect(errorResponse(knownError("P2025", {})).status).toBe(404);
    expect(errorResponse(knownError("P2003", {})).status).toBe(400);
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("connection string leaked here"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
    expect(spy).toHaveBeenCalled();
  });
});

describe("uniqueFields", () => {
  it("reads classic meta.target and constraint field lists", () => {
    expect(uniqueFields(knownError("P2002", { target: ["email"] }))).toEqual(["email"]);
    expect(uniqueFields(knownError("P2002", { target: "users_email_key" }))).toEqual(["users_email_key"]);
    expect(
      uniqueFields(knownError("P2002", { driverAdapterError: { cause: { constraint: { fields: ['"car_id"'] } } } })),
    ).toEqual(["carId"]);
    expect(uniqueFields(knownError("P2002", {}))).toEqual([]);
  });
});

describe("parseBody / parseQuery", () => {
  const schema = z.object({ n: z.coerce.number() });

  it("rejects malformed JSON with a 400 HttpError", async () => {
    const req = new Request("http://x", { method: "POST", body: "{nope" });
    await expect(parseBody(req, schema)).rejects.toMatchObject({ status: 400, message: "Malformed JSON in request body" });
  });

  it("treats an empty body as {}", async () => {
    const req = new Request("http://x", { method: "POST" });
    await expect(parseBody(req, z.object({ a: z.string().optional() }))).resolves.toEqual({});
  });

  it("parses query strings", () => {
    expect(parseQuery(new NextRequest("http://x/?n=5"), schema)).toEqual({ n: 5 });
  });
});

describe("route()", () => {
  it("serialises plain results as JSON and awaits dynamic params", async () => {
    const handler = route<{ id: string }>({}, async ({ params }) => ({ got: params.id }));
    const res = await handler(new NextRequest("http://x/api"), { params: Promise.resolve({ id: "42" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ got: "42" });
  });

  it("converts thrown errors", async () => {
    const handler = route({}, async () => {
      throw notFound("Stage not found");
    });
    const res = await handler(new NextRequest("http://x/api"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ message: "Stage not found" });
  });

  it("applies rate limits per client IP before running the handler", async () => {
    const work = vi.fn(async () => ({ ok: true }));
    const handler = route({ rateLimit: { name: "route-test", windowMs: 60_000, max: 1, message: "Too many" } }, work);
    const call = (ip: string) =>
      handler(new NextRequest("http://x/api", { headers: { "x-forwarded-for": ip } }), { params: Promise.resolve({}) });

    expect((await call("1.1.1.1")).status).toBe(200);
    const limited = await call("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ message: "Too many" });
    expect((await call("2.2.2.2")).status).toBe(200);
    expect(work).toHaveBeenCalledTimes(2);
  });
});
