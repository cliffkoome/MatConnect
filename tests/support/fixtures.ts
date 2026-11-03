import type { User } from "@/generated/prisma/client";
import type { AuthIdentity } from "@/server/modules/auth/auth.service";

export function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    authUserId: "auth-user-1",
    name: "Ada Admin",
    email: "ada@example.com",
    role: "Passenger",
    phoneNumber: null,
    profilePictureUrl: null,
    disabled: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** A Neon Auth session user, as `currentIdentity()` returns it. */
export function identity(overrides: Partial<AuthIdentity> = {}): AuthIdentity {
  return {
    id: "auth-user-1",
    email: "ada@example.com",
    name: "Ada Admin",
    image: null,
    emailVerified: true,
    ...overrides,
  };
}
