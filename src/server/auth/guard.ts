import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { forbidden, unauthorized } from "@/server/http/errors";
import { linkAuthUser, type AuthIdentity } from "@/server/modules/auth/auth.service";
import { neonAuth } from "./neon";

/** The signed-in caller as the API sees them: the app's own user row, not the Neon Auth user. */
export type AuthUser = { id: number; authUserId: string; email: string; role: Role };

/** Reads the Neon Auth session from the request cookies. Null when signed out or the session is invalid. */
export async function currentIdentity(): Promise<AuthIdentity | null> {
  const { data } = await neonAuth().getSession();
  const user = data?.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image ?? null,
    emailVerified: Boolean(user.emailVerified),
  };
}

/**
 * Authenticates the request from its Neon Auth session cookie and authorises the app role.
 * Disabled and role checks read the current `users` row on every request, so blocking a user or
 * changing their role takes effect immediately.
 */
export async function authenticate(role?: Role): Promise<AuthUser> {
  const identity = await currentIdentity();
  if (!identity) throw unauthorized("Access denied. Please sign in.");
  // Roles are granted by email (first user, Admin-provisioned accounts), so the email must be proven.
  if (!identity.emailVerified) throw forbidden("Please verify your email address first.");

  const user = await linkAuthUser(identity);
  if (user.disabled) throw forbidden("Account disabled");
  if (role && user.role !== role) throw forbidden();

  return { id: user.id, authUserId: identity.id, email: user.email, role: user.role };
}
