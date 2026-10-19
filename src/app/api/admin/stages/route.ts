import { json, parseBody, parseQuery, route } from "@/server/http/route";
import { createStageSchema, paginationQuerySchema } from "@/server/modules/admin/admin.schemas";
import { createStage, listStagesWithVehicles } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../_shared";

export const GET = route(adminOnly, ({ req }) => listStagesWithVehicles(parseQuery(req, paginationQuerySchema)));

export const POST = route(adminOnly, async ({ req }) => json(await createStage(await parseBody(req, createStageSchema)), 201));
