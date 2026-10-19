import { rateLimits } from "@/server/http/rate-limit";
import { parseBody, parseParams, route } from "@/server/http/route";
import { resetPasswordBodySchema, resetPasswordParamsSchema } from "@/server/modules/auth/auth.schemas";
import { resetPassword } from "@/server/modules/auth/auth.service";

export const POST = route<{ id: string; token: string }>({ rateLimit: rateLimits.auth }, async ({ req, params }) => {
  const { id, token } = parseParams(params, resetPasswordParamsSchema);
  const { password } = await parseBody(req, resetPasswordBodySchema);
  await resetPassword(id, token, password);
  return { message: "Password has been reset" };
});
