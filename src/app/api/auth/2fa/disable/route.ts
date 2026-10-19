import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { disableTwoFactor } from "@/server/modules/auth/auth.service";

export const POST = route({ auth: "any", rateLimit: rateLimits.auth }, async ({ user }) => {
  await disableTwoFactor(user.id);
  return { message: "2FA disabled successfully" };
});
