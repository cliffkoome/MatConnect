import { describe, expect, it } from "vitest";
import { HttpError } from "@/server/http/errors";
import { RateLimiter, clientKeyFrom, rateLimits } from "@/server/http/rate-limit";

const rule = { name: "t", windowMs: 1_000, max: 2, message: "slow down" };

describe("RateLimiter", () => {
  it("allows up to `max` hits per window, then throws 429 with Retry-After", () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    expect(limiter.hit(rule, "ip").remaining).toBe(1);
    expect(limiter.hit(rule, "ip").remaining).toBe(0);

    now = 400;
    let thrown: unknown;
    try {
      limiter.hit(rule, "ip");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HttpError);
    expect(thrown).toMatchObject({ status: 429, message: "slow down", headers: { "Retry-After": "1" } });
  });

  it("starts a fresh window after it expires", () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    limiter.hit(rule, "ip");
    limiter.hit(rule, "ip");
    now = 1_000;
    expect(() => limiter.hit(rule, "ip")).not.toThrow();
  });

  it("counts clients and buckets separately", () => {
    const limiter = new RateLimiter(() => 0);
    limiter.hit(rule, "a");
    limiter.hit(rule, "a");
    expect(() => limiter.hit(rule, "b")).not.toThrow();
    expect(() => limiter.hit({ ...rule, name: "other" }, "a")).not.toThrow();
  });

  it("keeps the original Express limits", () => {
    expect(rateLimits.auth).toMatchObject({ windowMs: 15 * 60_000, max: 100 });
    expect(rateLimits.admin).toMatchObject({ windowMs: 15 * 60_000, max: 50 });
    expect(rateLimits.dashboard).toMatchObject({ windowMs: 60_000, max: 30 });
    expect(rateLimits.subscription).toMatchObject({ windowMs: 10 * 60_000, max: 30 });
  });
});

describe("clientKeyFrom", () => {
  it("uses the first X-Forwarded-For hop", () => {
    expect(clientKeyFrom(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });
  it("falls back to X-Real-IP, then 'unknown'", () => {
    expect(clientKeyFrom(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientKeyFrom(new Headers())).toBe("unknown");
  });
});
