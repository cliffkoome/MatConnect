import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { listVehiclesForFeedback } from "@/server/modules/feedback/feedback.service";

export const GET = route({ auth: "Passenger", rateLimit: rateLimits.api }, () => listVehiclesForFeedback());
