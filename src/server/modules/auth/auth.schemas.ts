import { z } from "zod";
import { personName } from "@/server/validation/common";

export const updateProfileSchema = z.object({
  name: personName().optional(),
  phoneNumber: z.string({ error: "Invalid phone number" }).max(32, "Invalid phone number").optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
