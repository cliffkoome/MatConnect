import type { User } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";

export const PASSWORD = "secret123";
let cachedHash: string | undefined;
export const passwordHash = async () => (cachedHash ??= await hashPassword(PASSWORD));

export function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    name: "Ada Admin",
    email: "ada@example.com",
    password: null,
    role: "Passenger",
    googleId: null,
    phoneNumber: null,
    profilePictureUrl: null,
    twoFactorSecret: null,
    twoFactorEnabled: false,
    disabled: false,
    tokensValidFrom: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}
