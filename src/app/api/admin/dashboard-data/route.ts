import { route } from "@/server/http/route";
import { dashboardData } from "@/server/modules/admin/admin.service";
import { adminDashboard } from "../_shared";

export const GET = route(adminDashboard, () => dashboardData());
