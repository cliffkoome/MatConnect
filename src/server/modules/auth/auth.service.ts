import "server-only";
import { Prisma, type User } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { normalizePhoneNumber } from "@/server/domain/phone";
import { notFound } from "@/server/http/errors";
import type { UpdateProfileInput } from "./auth.schemas";

/**
 * Identity lives in Neon Auth (sign-up, sign-in, Google, sessions, email verification, password
 * reset). This module only maps a Neon Auth user onto the app's `users` row, which holds the role,
 * phone number and disabled flag that the rest of MatConnect uses.
 */

/** The parts of a Neon Auth session user the app needs. */
export type AuthIdentity = { id: string; email: string; name: string; image: string | null; emailVerified: boolean };

export type PublicUser = Omit<User, "authUserId">;

/** Never send internal identifiers to the client. */
export function toPublicUser(user: User): PublicUser {
  const { authUserId: _authUserId, ...rest } = user;
  return rest;
}

/**
 * Returns the app user for a verified Neon Auth identity, creating or linking it on first sign-in:
 *  - already linked → that row;
 *  - a row with the same email exists (added by an Admin, seeded, or from an earlier Neon Auth
 *    account for the same verified email) → link it, keeping its role;
 *  - otherwise create one. The very first user becomes the Admin (bootstrap), everyone else a Passenger.
 *
 * Callers must only pass identities whose email is verified: the email decides which row and role
 * the person gets.
 */
export async function linkAuthUser(identity: AuthIdentity): Promise<User> {
  const linked = await db.user.findUnique({ where: { authUserId: identity.id } });
  if (linked) return linked;

  const email = identity.email.toLowerCase();
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        return tx.user.update({
          where: { id: existing.id },
          data: { authUserId: identity.id, profilePictureUrl: existing.profilePictureUrl ?? identity.image },
        });
      }
      const role = (await tx.user.count()) === 0 ? Role.Admin : Role.Passenger;
      const user = await tx.user.create({
        data: { authUserId: identity.id, email, name: identity.name || email, profilePictureUrl: identity.image, role },
      });
      if (role === Role.Admin) console.info("[auth] first user signed in — promoted to Admin");
      return user;
    });
  } catch (error) {
    // Two first requests for the same person raced; the other one created the row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const user = await db.user.findUnique({ where: { authUserId: identity.id } });
      if (user) return user;
    }
    throw error;
  }
}

export async function getProfile(userId: number): Promise<PublicUser> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found");
  return toPublicUser(user);
}

export async function updateProfile(userId: number, input: UpdateProfileInput): Promise<void> {
  const data: { name?: string; phoneNumber?: string | null } = {};
  if (input.name) data.name = input.name;
  if (input.phoneNumber !== undefined) {
    data.phoneNumber = input.phoneNumber === null ? null : normalizePhoneNumber(input.phoneNumber);
  }
  const { count } = await db.user.updateMany({ where: { id: userId }, data });
  if (count === 0) throw notFound("User not found");
}
