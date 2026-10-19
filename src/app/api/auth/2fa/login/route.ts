import { setRefreshCookie } from "@/server/auth/cookies";
import { rateLimits } from "@/server/http/rate-limit";
import { json, parseBody, route } from "@/server/http/route";
import { twoFactorLoginSchema } from "@/server/modules/auth/auth.schemas";
import { completeTwoFactorLogin } from "@/server/modules/auth/auth.service";

export const POST = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const { tempToken, token } = await parseBody(req, twoFactorLoginSchema);
  const session = await completeTwoFactorLogin(tempToken, token);
  const res = json({ message: "Login successful", accessToken: session.accessToken, role: session.role });
  setRefreshCookie(res, session.refreshToken);
  return res;
});
