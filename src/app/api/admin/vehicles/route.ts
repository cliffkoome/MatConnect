import { json, parseBody, parseQuery, route } from "@/server/http/route";
import { createVehicleSchema, paginationQuerySchema } from "@/server/modules/admin/admin.schemas";
import { listVehicles } from "@/server/modules/admin/admin.service";
import { createVehicle } from "@/server/modules/vehicles/vehicles";
import { adminOnly } from "../_shared";

export const GET = route(adminOnly, ({ req }) => listVehicles(parseQuery(req, paginationQuerySchema)));

export const POST = route(adminOnly, async ({ req }) => json(await createVehicle(await parseBody(req, createVehicleSchema)), 201));
