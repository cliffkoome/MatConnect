import { route } from "@/server/http/route";
import { dashboardSummary } from "@/server/modules/mat-admin/mat-admin.service";
import { matAdminDashboard } from "../_shared";

export const GET = route(matAdminDashboard, ({ user }) => dashboardSummary(user.id));
