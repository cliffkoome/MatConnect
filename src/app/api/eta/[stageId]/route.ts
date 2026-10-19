import { z } from "zod";
import { rateLimits } from "@/server/http/rate-limit";
import { parseParams, route } from "@/server/http/route";
import { getStageEta } from "@/server/modules/eta/eta.service";
import { id } from "@/server/validation/common";

const paramsSchema = z.object({ stageId: id("Stage ID") });

/** Live ETAs for the vehicles serving a stage. */
export const GET = route<{ stageId: string }>({ auth: "any", rateLimit: rateLimits.api }, ({ params }) =>
  getStageEta(parseParams(params, paramsSchema).stageId),
);
