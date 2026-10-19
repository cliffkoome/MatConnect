import { afterEach, beforeEach } from "vitest";
import { resetEnvCache } from "@/server/env";
import { rateLimiter } from "@/server/http/rate-limit";

export const TEST_SECRETS = {
  JWT_SECRET: "test-access-secret-0123456789abcdefghij",
  JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdefghij",
};

beforeEach(() => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.JWT_SECRET = TEST_SECRETS.JWT_SECRET;
  process.env.JWT_REFRESH_SECRET = TEST_SECRETS.JWT_REFRESH_SECRET;
  process.env.APP_URL = "http://localhost:3000";
  process.env.CRON_SECRET = "test-cron-secret-123456";
  resetEnvCache();
  rateLimiter.reset();
});

afterEach(() => {
  resetEnvCache();
});
