import { z } from "zod";

/** Lower-cased, trimmed email (express-validator's normalizeEmail did the lower-casing before). */
export const email = (message = "Please provide a valid email") =>
  z.string({ error: message }).trim().toLowerCase().pipe(z.email(message));

/** bcrypt only looks at the first 72 bytes, so longer passwords give a false sense of security. */
export const newPassword = z
  .string({ error: "Password must be at least 6 characters long" })
  .min(6, "Password must be at least 6 characters long")
  .max(72, "Password must be at most 72 characters long");

export const personName = (message = "Name is required") =>
  z.string({ error: message }).trim().min(1, message).max(100, "Name is too long");

/** Positive integer from a path segment, query string or JSON (accepts "12" or 12). */
export const id = (label = "ID") =>
  z.coerce
    .number({ error: `${label} must be a positive integer` })
    .int(`${label} must be a positive integer`)
    .positive(`${label} must be a positive integer`);

export const pagination = (defaultLimit = 25, maxLimit = 100) =>
  z.object({
    limit: z.coerce.number().int().positive().max(maxLimit).catch(defaultLimit).default(defaultLimit),
    offset: z.coerce.number().int().min(0).catch(0).default(0),
  });

export const otpCode = z
  .string({ error: "Please enter a valid 6-digit code." })
  .trim()
  .regex(/^\d{6}$/, "Please enter a valid 6-digit code.");
