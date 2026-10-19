import { parseParams, parseQuery, route } from "@/server/http/route";
import { periodQuerySchema, vehicleChartData, vehicleIdParamSchema } from "@/server/modules/mat-admin/mat-admin.service";
import { matAdminOnly } from "../../../_shared";

export const GET = route<{ vehicleId: string }>(matAdminOnly, ({ req, params, user }) =>
  vehicleChartData(user.id, parseParams(params, vehicleIdParamSchema).vehicleId, parseQuery(req, periodQuerySchema).period),
);
