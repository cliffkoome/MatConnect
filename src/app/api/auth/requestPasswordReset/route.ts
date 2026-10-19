import { rateLimits } from "@/server/http/rate-limit";
import { parseBody, route } from "@/server/http/route";
import { requestPasswordResetSchema } from "@/server/modules/auth/auth.schemas";
import { requestPasswordReset } from "@/server/modules/auth/auth.service";

export const POST = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const { email } = await parseBody(req, requestPasswordResetSchema);
  return { message: await requestPasswordReset(email) };
});
