import { rateLimits } from "@/server/http/rate-limit";
import { parseParams, route } from "@/server/http/route";
import { getSubscriptionStatus } from "@/server/modules/stages/stages.service";
import { stageParamsSchema, type StageParams } from "../../params";

export const GET = route<StageParams>({ auth: "any", rateLimit: rateLimits.api }, ({ params, user }) =>
  getSubscriptionStatus(user.id, parseParams(params, stageParamsSchema).stageId),
);
