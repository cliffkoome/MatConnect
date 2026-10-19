import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, buildGoogleAuthUrl, googleCredentials } from "@/server/auth/google";
import { rateLimits } from "@/server/http/rate-limit";
import { route } from "@/server/http/route";

/** Starts Google sign-in. A random `state` cookie protects the callback against CSRF. */
export const GET = route({ rateLimit: rateLimits.auth }, async ({ req }) => {
  const creds = googleCredentials();
  if (!creds) return NextResponse.redirect(new URL("/login?error=google_unavailable", req.url));

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildGoogleAuthUrl(creds.clientId, creds.redirectUri, state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
});
