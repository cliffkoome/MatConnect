import { z } from "zod";

/** Lower-cased, trimmed email (express-validator's normalizeEmail did the lower-casing before). */
export const email = (message = "Please provide a valid email") =>
  z.string({ error: message }).trim().toLowerCase().pipe(z.email(message));

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

