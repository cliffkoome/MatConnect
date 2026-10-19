import { REFRESH_COOKIE, setRefreshCookie } from "@/server/auth/cookies";
import { rateLimits } from "@/server/http/rate-limit";
import { json, route } from "@/server/http/route";
import { refreshSession } from "@/server/modules/auth/auth.service";

/** Rotates the refresh cookie and returns a new access token. */
export const POST = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const header = req.headers.get("authorization");
  const accessToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const session = await refreshSession(req.cookies.get(REFRESH_COOKIE)?.value, accessToken);
  const res = json({ accessToken: session.accessToken, role: session.role });
  setRefreshCookie(res, session.refreshToken);
  return res;
});
