import { z } from "zod";
import { email, id, newPassword, otpCode, personName } from "@/server/validation/common";

export const loginSchema = z.object({
  email: email(),
  password: z.string({ error: "Password cannot be empty" }).min(1, "Password cannot be empty"),
});

export const registerSchema = z.object({
  name: personName(),
  email: email(),
  password: newPassword,
});

export const updateProfileSchema = z.object({
  name: personName().optional(),
  phoneNumber: z.string({ error: "Invalid phone number" }).max(32, "Invalid phone number").optional().nullable(),
});

export const requestPasswordResetSchema = z.object({ email: email() });

export const resetPasswordParamsSchema = z.object({
  id: id("User ID"),
  token: z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, "Invalid token format"),
});
export const resetPasswordBodySchema = z.object({ password: newPassword });

export const verifyTwoFactorSchema = z.object({ token: otpCode });
export const twoFactorLoginSchema = z.object({
  tempToken: z.string({ error: "2FA session token is required" }).min(1, "2FA session token is required"),
  token: otpCode,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
