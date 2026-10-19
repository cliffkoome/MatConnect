import { NextResponse } from "next/server";
import { setRefreshCookie } from "@/server/auth/cookies";
import { OAUTH_STATE_COOKIE, exchangeGoogleCode } from "@/server/auth/google";
import { HttpError } from "@/server/http/errors";
import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";
import { loginWithGoogle } from "@/server/modules/auth/auth.service";

export const GET = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const failure = (reason = "auth_failed") => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/google" });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) return failure();

  try {
    const session = await loginWithGoogle(await exchangeGoogleCode(code));
    // The token travels in the fragment, which browsers never send to servers or put in logs.
    const target = new URL("/auth/success", req.url);
    target.hash = new URLSearchParams({ accessToken: session.accessToken, role: session.role }).toString();
    const res = NextResponse.redirect(target);
    res.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/google" });
    setRefreshCookie(res, session.refreshToken);
    return res;
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) return failure("account_disabled");
    console.error("[auth] Google sign-in failed", error);
    return failure();
  }
});
