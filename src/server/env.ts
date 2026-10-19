import "server-only";
import { z } from "zod";

/**
 * Typed, validated server environment.
 *
 * Parsed lazily on first access so `next build` (which imports route modules) does not require
 * runtime secrets. Optional integrations (Firebase, Google Maps, SMS, email, Google OAuth) degrade
 * gracefully when their variables are missing, matching the behaviour of the original Express app.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database (Neon): pooled URL for the app, direct URL for migrations (see prisma.config.ts).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** "neon" uses the Neon serverless driver, "pg" uses node-postgres. Defaults to auto-detect. */
  DATABASE_DRIVER: z.enum(["neon", "pg"]).optional(),

  APP_URL: z.string().url().default("http://localhost:3000"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  GOOGLE_MAPS_API_KEY: z.string().optional(),

  FIREBASE_CREDENTIALS_BASE64: z.string().optional(),
  FIREBASE_DATABASE_URL: z
    .string()
    .url()
    .default("https://matatu-eta-default-rtdb.europe-west1.firebasedatabase.app/"),

  AFRICAS_TALKING_API_KEY: z.string().optional(),
  AFRICAS_TALKING_USERNAME: z.string().optional(),

  EMAIL_HOST: z.string().default("smtp.gmail.com"),
  EMAIL_PORT: z.coerce.number().int().positive().default(465),
  EMAIL_SECURE: z
    .string()
    .optional()
    .transform((v) => v !== "false"),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  /** Shared secret for /api/cron/* (Vercel Cron sends it as `Authorization: Bearer <secret>`). */
  CRON_SECRET: z.string().min(16).optional(),
  /** "interval" runs the ETA cycle in-process every 30s (self-hosted `next start`); "cron" relies on /api/cron. */
  ETA_CYCLE_MODE: z.enum(["interval", "cron", "off"]).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached env so tests can change process.env between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}
