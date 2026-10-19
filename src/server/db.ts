import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * Prisma client singleton.
 *
 * Neon: `DATABASE_URL` should be the pooled connection string (host contains `-pooler`). By default
 * Neon hosts use the Neon serverless driver (low-latency, serverless-friendly); anything else
 * (local Docker Postgres, CI service containers) uses node-postgres. Override with DATABASE_DRIVER.
 */
export function resolveDriver(url: string, explicit?: "neon" | "pg"): "neon" | "pg" {
  if (explicit) return explicit;
  try {
    return new URL(url).hostname.endsWith(".neon.tech") ? "neon" : "pg";
  } catch {
    return "pg";
  }
}

/**
 * node-postgres pool whose sessions run in UTC.
 *
 * The pg driver adapter sends JS Dates as UTC wall-clock strings without an offset, so a server whose
 * TimeZone isn't UTC (a laptop install, some managed hosts) would shift every timestamptz write.
 * Neon defaults to GMT; this makes other servers behave the same.
 */
export function createUtcPool(connectionString: string): pg.Pool {
  // `onConnect` is awaited before the pool hands the client out, so no query can race the SET.
  return new pg.Pool({ connectionString, onConnect: async (client) => void (await client.query("SET TIME ZONE 'UTC'")) });
}

function createClient(): PrismaClient {
  const { DATABASE_URL, DATABASE_DRIVER, NODE_ENV } = env();
  const adapter =
    resolveDriver(DATABASE_URL, DATABASE_DRIVER) === "neon"
      ? new PrismaNeon({ connectionString: DATABASE_URL })
      : new PrismaPg(createUtcPool(DATABASE_URL));

  return new PrismaClient({
    adapter,
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

/** Lazily-created client, reused across hot reloads in development. */
export function getDb(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createClient();
  }
  return globalForPrisma.__prisma;
}

/**
 * Convenience proxy so modules can `import { db } from "@/server/db"` without creating a
 * connection at import time (keeps `next build` and unit tests free of DB access).
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = PrismaClient;
