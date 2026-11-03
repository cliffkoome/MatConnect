import { afterEach, beforeEach } from "vitest";
import { resetEnvCache } from "@/server/env";
import { rateLimiter } from "@/server/http/rate-limit";

beforeEach(() => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NEON_AUTH_BASE_URL = "https://auth.test.neon.local/neondb/auth";
  process.env.NEON_AUTH_COOKIE_SECRET = "test-cookie-secret-0123456789abcdefghij";
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "test-cron-secret-123456";
  resetEnvCache();
  rateLimiter.reset();
});

afterEach(() => {
  resetEnvCache();
});
