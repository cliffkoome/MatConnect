import { rateLimits } from "@/server/http/rate-limit";
import { parseParams, route } from "@/server/http/route";
import { unsubscribe } from "@/server/modules/stages/stages.service";
import { stageParamsSchema, type StageParams } from "../../params";

export const POST = route<StageParams>({ auth: "any", rateLimit: rateLimits.subscription }, ({ params, user }) =>
  unsubscribe(user.id, parseParams(params, stageParamsSchema).stageId),
);
