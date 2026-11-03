import { defineConfig } from "vitest/config";
import { sharedResolve } from "./vitest.config.ts";

/**
 * Integration tests run against a real, migrated Postgres (CI uses a service container; locally,
 * point DATABASE_URL at a disposable database or a Neon branch). They are excluded from `npm test`.
 */
export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // @neon/auth imports `next/headers` without an extension, which Node's ESM loader can't resolve
    // outside Next.js; letting Vite bundle it resolves the import the way Next does.
    server: { deps: { inline: ["@neon/auth"] } },
  },
});
