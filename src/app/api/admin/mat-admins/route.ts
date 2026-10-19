import { route } from "@/server/http/route";
import { listMatAdmins } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../_shared";

export const GET = route(adminOnly, () => listMatAdmins());
