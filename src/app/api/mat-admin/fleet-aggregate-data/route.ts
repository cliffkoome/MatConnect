import { parseQuery, route } from "@/server/http/route";
import { fleetAggregate, periodQuerySchema } from "@/server/modules/mat-admin/mat-admin.service";
import { matAdminOnly } from "../_shared";

export const GET = route(matAdminOnly, ({ req, user }) => fleetAggregate(user.id, parseQuery(req, periodQuerySchema).period));
