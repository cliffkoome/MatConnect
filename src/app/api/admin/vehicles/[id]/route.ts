import { parseParams, route } from "@/server/http/route";
import { idParamSchema } from "@/server/modules/admin/admin.schemas";
import { deleteVehicle } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../../_shared";

export const DELETE = route<{ id: string }>(adminOnly, ({ params }) => deleteVehicle(parseParams(params, idParamSchema).id));
