import { parseParams, route } from "@/server/http/route";
import { stageVehicleParamsSchema } from "@/server/modules/admin/admin.schemas";
import { removeVehicleFromStage } from "@/server/modules/admin/admin.service";
import { adminOnly } from "../../../../_shared";

export const DELETE = route<{ stageId: string; vehicleId: string }>(adminOnly, ({ params }) => {
  const { stageId, vehicleId } = parseParams(params, stageVehicleParamsSchema);
  return removeVehicleFromStage(stageId, vehicleId);
});
