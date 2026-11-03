"use client";

import { createAuthClient } from "@neon/auth/next";

/**
 * Neon Auth browser client. It talks to the same-origin proxy at /api/auth/[...path], which keeps
 * the session in httpOnly cookies (no tokens in localStorage). Results are `{ data, error }`.
 */
export const authClient = createAuthClient();

/** Neon Auth / Better Auth error → a message for the user. */
export function authErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Invalid email or password.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in instead.";
    case "INVALID_OTP":
      return "That code is incorrect. Check the email and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Request a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts. Request a new code.";
    case "PASSWORD_TOO_SHORT":
      return "Password is too short.";
  }
  if (error?.status === 429) return "Too many attempts. Please wait a moment and try again.";
  return error?.message || "Something went wrong. Please try again.";
}

export const isEmailNotVerified = (error: { code?: string; status?: number } | null | undefined) =>
  error?.code === "EMAIL_NOT_VERIFIED";
