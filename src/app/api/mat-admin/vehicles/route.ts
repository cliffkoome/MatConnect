import { z } from "zod";
import { json, parseBody, route } from "@/server/http/route";
import { createVehicleSchema } from "@/server/modules/admin/admin.schemas";
import { myVehicles } from "@/server/modules/mat-admin/mat-admin.service";
import { createVehicle } from "@/server/modules/vehicles/vehicles";
import { matAdminOnly } from "../_shared";

const bodySchema = createVehicleSchema.pick({ carId: true, plateNumber: true });

export const GET = route(matAdminOnly, ({ user }) => myVehicles(user.id));

/** A Matatu admin's new vehicle is always owned by them. */
export const POST = route(matAdminOnly, async ({ req, user }) => {
  const input: z.infer<typeof bodySchema> = await parseBody(req, bodySchema);
  return json(await createVehicle({ ...input, ownerId: user.id }), 201);
});
