import { parseQuery, route } from "@/server/http/route";
import { statsQuerySchema, vehicleStats } from "@/server/modules/mat-admin/mat-admin.service";
import { matAdminOnly } from "../_shared";

/** ?date=YYYY-MM-DD (UTC) — defaults to today. */
export const GET = route(matAdminOnly, ({ req, user }) => vehicleStats(user.id, parseQuery(req, statsQuerySchema).date));
