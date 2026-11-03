import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { env } from "@/server/env";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

/**
 * Neon Auth (Managed Better Auth) for this branch. Users, credentials and sessions live in the
 * branch's `neon_auth` schema; the app never calls `betterAuth()` or runs auth migrations itself.
 *
 * Created lazily so `next build`, which imports every route module, doesn't need the secrets.
 */
export function neonAuth(): NeonAuth {
  if (!instance) {
    const { NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET } = env();
    instance = createNeonAuth({
      baseUrl: NEON_AUTH_BASE_URL,
      cookies: { secret: NEON_AUTH_COOKIE_SECRET },
    });
  }
  return instance;
}

/** Test helper: drop the cached instance so a test can swap the environment. */
export function resetNeonAuth(): void {
  instance = undefined;
}
