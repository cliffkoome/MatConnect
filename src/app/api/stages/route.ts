import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { listStages } from "@/server/modules/stages/stages.service";

export const GET = route({ auth: "any", rateLimit: rateLimits.api }, () => listStages());
