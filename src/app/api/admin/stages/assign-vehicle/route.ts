import { parseBody, route } from "@/server/http/route";
import { assignVehicleSchema } from "@/server/modules/admin/admin.schemas";
import { assignVehicleToStage } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../../_shared";

export const POST = route(adminOnly, async ({ req }) => {
  const { stageId, vehicleId } = await parseBody(req, assignVehicleSchema);
  return assignVehicleToStage(stageId, vehicleId);
});
