import { rateLimits } from "@/server/http/rate-limit";
import { json, parseBody, route } from "@/server/http/route";
import { submitFeedback, submitFeedbackSchema } from "@/server/modules/feedback/feedback.service";

export const POST = route({ auth: "Passenger", rateLimit: rateLimits.api }, async ({ req, user }) =>
  json(await submitFeedback(user.id, await parseBody(req, submitFeedbackSchema)), 201),
);
