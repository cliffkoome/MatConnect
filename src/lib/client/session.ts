"use client";

import type { Role } from "./types";

/**
 * The access token lives in localStorage (as before) so existing sessions survive the migration;
 * the refresh token is an httpOnly cookie the browser sends only to /api/auth/*.
 */
const TOKEN_KEY = "accessToken";
const ROLE_KEY = "role";

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

export function getSession(): { accessToken: string; role: Role } | null {
  const s = storage();
  const accessToken = s?.getItem(TOKEN_KEY);
  const role = s?.getItem(ROLE_KEY) as Role | null | undefined;
  return accessToken && role ? { accessToken, role } : null;
}

export function setSession(accessToken: string, role: Role) {
  storage()?.setItem(TOKEN_KEY, accessToken);
  storage()?.setItem(ROLE_KEY, role);
}

export function clearSession() {
  storage()?.removeItem(TOKEN_KEY);
  storage()?.removeItem(ROLE_KEY);
}

export function homePathFor(role: Role): string {
  switch (role) {
    case "Admin":
      return "/admin";
    case "MatAdmin":
      return "/mat-admin";
    default:
      return "/stages";
  }
}
