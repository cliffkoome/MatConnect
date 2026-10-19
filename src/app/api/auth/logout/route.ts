import { REFRESH_COOKIE, clearRefreshCookie } from "@/server/auth/cookies";
import { rateLimits } from "@/server/http/rate-limit";
import { json, route } from "@/server/http/route";
import { logout } from "@/server/modules/auth/auth.service";

/**
 * Revokes the presented access + refresh tokens and clears the cookie. Works with an expired
 * access token too, so a user can always log out.
 */
export const POST = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const header = req.headers.get("authorization");
  const accessToken = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  await logout(accessToken, req.cookies.get(REFRESH_COOKIE)?.value);
  const res = json({ message: "Logged out successfully." });
  clearRefreshCookie(res);
  return res;
});
