import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export const sharedResolve = {
  alias: {
    "@": r("./src"),
    // `server-only` throws outside React Server Components; tests import server modules directly.
    "server-only": r("./tests/support/server-only.ts"),
  },
};

export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/api/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    restoreMocks: true,
  },
});
