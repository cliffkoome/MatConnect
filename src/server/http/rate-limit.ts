import { tooManyRequests } from "./errors";

export type RateLimitRule = {
  /** Bucket name; requests are counted per (bucket, client key). */
  name: string;
  windowMs: number;
  max: number;
  message: string;
};

/**
 * Same limits as the original express-rate-limit configuration.
 *
 * NOTE: counters live in process memory. On serverless platforms each instance counts separately,
 * so these are best-effort abuse limits rather than hard quotas. Put a shared store (e.g. Upstash
 * Redis) behind `RateLimiter` if you need global limits.
 */
export const rateLimits = {
  auth: { name: "auth", windowMs: 15 * 60_000, max: 100, message: "Too many requests from this IP, please try again after 15 minutes" },
  subscription: { name: "subscription", windowMs: 10 * 60_000, max: 30, message: "Too many subscription requests. Please try again later." },
  api: { name: "api", windowMs: 15 * 60_000, max: 100, message: "Too many requests from this IP, please try again after 15 minutes" },
  admin: { name: "admin", windowMs: 15 * 60_000, max: 50, message: "Too many admin requests. Please try again later." },
  dashboard: { name: "dashboard", windowMs: 60_000, max: 30, message: "Too many dashboard requests. Please try again later." },
} satisfies Record<string, RateLimitRule>;

type Window = { count: number; resetAt: number };

/** Fixed-window counter. */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Records a hit and throws a 429 HttpError when the limit is exceeded. */
  hit(rule: RateLimitRule, clientKey: string): { remaining: number; resetAt: number } {
    const now = this.now();
    this.sweep(now);
    const key = `${rule.name}:${clientKey}`;
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + rule.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count > rule.max) {
      throw tooManyRequests(rule.message, Math.ceil((window.resetAt - now) / 1000));
    }
    return { remaining: rule.max - window.count, resetAt: window.resetAt };
  }

  reset(): void {
    this.windows.clear();
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

export const rateLimiter = new RateLimiter();

/** Best-effort client IP (first hop of X-Forwarded-For, as set by Vercel / most proxies). */
export function clientKeyFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
