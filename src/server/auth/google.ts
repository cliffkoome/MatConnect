import "server-only";
import { z } from "zod";
import { env } from "@/server/env";
import type { GoogleProfile } from "@/server/modules/auth/auth.service";

/**
 * Minimal Google OAuth 2.0 / OpenID Connect authorisation-code flow (replaces passport-google-oauth20).
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const OAUTH_STATE_COOKIE = "oauth_state";

export function googleCredentials() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL } = env();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: new URL("/api/auth/google/callback", APP_URL).toString(),
  };
}

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

const userInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const creds = googleCredentials();
  if (!creds) throw new Error("Google OAuth is not configured");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: HTTP ${tokenRes.status}`);
  const { access_token } = z.object({ access_token: z.string() }).parse(await tokenRes.json());

  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed: HTTP ${infoRes.status}`);
  const info = userInfoSchema.parse(await infoRes.json());
  if (info.email_verified === false) throw new Error("Google email address is not verified");

  return { sub: info.sub, email: info.email, name: info.name ?? info.email, picture: info.picture };
}
