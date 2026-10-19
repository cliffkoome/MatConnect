import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { id } from "@/server/validation/common";
import { activeVehicle } from "@/server/modules/vehicles/vehicles";

export const submitFeedbackSchema = z.object({
  vehicleId: id("Vehicle ID"),
  rating: z.coerce
    .number({ error: "Rating must be between 1 and 5" })
    .int("Rating must be between 1 and 5")
    .min(1, "Rating must be between 1 and 5")
    .max(5, "Rating must be between 1 and 5"),
  comment: z
    .string()
    .trim()
    .max(2000, "Comment is too long")
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export async function submitFeedback(userId: number, input: z.infer<typeof submitFeedbackSchema>) {
  const vehicle = await db.vehicle.findFirst({ where: { id: input.vehicleId, ...activeVehicle }, select: { id: true } });
  if (!vehicle) throw notFound("Vehicle not found.");
  await db.feedback.create({ data: { ...input, userId } });
  return { message: "Thank you for your feedback!" };
}

export const listVehiclesForFeedback = () =>
  db.vehicle.findMany({
    where: activeVehicle,
    orderBy: { plateNumber: "asc" },
    select: { id: true, plateNumber: true },
  });

/** Shape shared by the admin feed and the Matatu-admin vehicle cards. */
export const feedbackSelect = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  user: { select: { name: true } },
  vehicle: { select: { plateNumber: true } },
} as const;
