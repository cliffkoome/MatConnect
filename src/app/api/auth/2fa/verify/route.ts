import { rateLimits } from "@/server/http/rate-limit";
import { parseBody, route } from "@/server/http/route";
import { verifyTwoFactorSchema } from "@/server/modules/auth/auth.schemas";
import { confirmTwoFactorSetup } from "@/server/modules/auth/auth.service";

export const POST = route({ auth: "any", rateLimit: rateLimits.auth }, async ({ req, user }) => {
  const { token } = await parseBody(req, verifyTwoFactorSchema);
  await confirmTwoFactorSetup(user.id, token);
  return { message: "2FA enabled successfully" };
});
