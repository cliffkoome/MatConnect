import "server-only";
import type { NextResponse } from "next/server";
import { REFRESH_TOKEN_TTL_SECONDS } from "./tokens";

export const REFRESH_COOKIE = "refreshToken";

const baseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // Same-site app: Lax is enough and, unlike the old `SameSite=None`, isn't sent on cross-site POSTs.
  sameSite: "lax" as const,
  // Only the auth endpoints ever need to read it.
  path: "/api/auth",
});

export function setRefreshCookie(res: NextResponse, token: string) {
  res.cookies.set(REFRESH_COOKIE, token, { ...baseOptions(), maxAge: REFRESH_TOKEN_TTL_SECONDS });
}

export function clearRefreshCookie(res: NextResponse) {
  res.cookies.set(REFRESH_COOKIE, "", { ...baseOptions(), maxAge: 0 });
}
