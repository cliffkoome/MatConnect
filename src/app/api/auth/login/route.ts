import { setRefreshCookie } from "@/server/auth/cookies";
import { rateLimits } from "@/server/http/rate-limit";
import { json, parseBody, route } from "@/server/http/route";
import { loginSchema } from "@/server/modules/auth/auth.schemas";
import { login } from "@/server/modules/auth/auth.service";

export const POST = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const result = await login(await parseBody(req, loginSchema));
  if (result.twoFactorRequired) {
    return { twoFactorRequired: true, tempToken: result.tempToken };
  }
  const res = json({ message: "Login successful", accessToken: result.accessToken, role: result.role });
  setRefreshCookie(res, result.refreshToken);
  return res;
});
