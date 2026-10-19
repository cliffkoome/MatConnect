import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { email, id, newPassword, pagination, personName } from "@/server/validation/common";

export const createStageSchema = z.object({
  name: z.string({ error: "Stage name is required" }).trim().min(1, "Stage name is required").max(120),
  latitude: z.coerce
    .number({ error: "A valid latitude is required" })
    .min(-90, "A valid latitude is required")
    .max(90, "A valid latitude is required"),
  longitude: z.coerce
    .number({ error: "A valid longitude is required" })
    .min(-180, "A valid longitude is required")
    .max(180, "A valid longitude is required"),
});

const trimmedRequired = (message: string) => z.string({ error: message }).trim().min(1, message).max(64);

export const createVehicleSchema = z.object({
  carId: trimmedRequired("Car ID is required"),
  plateNumber: trimmedRequired("Plate number is required").transform((p) => p.toUpperCase()),
  ownerId: z
    .union([z.literal(""), z.null(), id("Owner ID")])
    .optional()
    .transform((v) => (typeof v === "number" ? v : null)),
});

export const assignVehicleSchema = z.object({
  stageId: id("Stage ID"),
  vehicleId: id("Vehicle ID"),
});

export const stageVehicleParamsSchema = assignVehicleSchema;
export const idParamSchema = z.object({ id: id() });

export const listUsersQuerySchema = pagination().extend({
  q: z.string().trim().max(100).catch("").default(""),
  role: z.enum(Role).optional().catch(undefined),
});

export const updateUserSchema = z.object({
  disabled: z.boolean({ error: "Disabled status must be a boolean" }),
});

export const createUserSchema = z.object({
  name: personName(),
  email: email(),
  password: newPassword,
  role: z.enum([Role.Admin, Role.MatAdmin], { error: "Invalid role specified" }),
});

export const paginationQuerySchema = pagination();
export const feedbackQuerySchema = pagination(10);
