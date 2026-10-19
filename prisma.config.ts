import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration.
 *
 * Neon exposes two connection strings:
 *  - DATABASE_URL: the *pooled* (PgBouncer, `-pooler` host) URL used by the app at runtime.
 *  - DIRECT_URL:   the *direct* (unpooled) URL. Migrations need a direct session
 *                  (advisory locks, DDL in transactions), so the CLI always prefers it.
 *
 * `prisma generate` does not need a database, so a missing URL is allowed here; commands
 * that do need one (`migrate`, `db`, `studio`) will fail with a clear Prisma error.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
