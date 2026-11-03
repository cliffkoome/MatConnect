"use client";

import type { Profile, Role } from "./types";

/**
 * The signed-in user's app profile (role, phone, …), fetched once per page load and shared.
 * The session itself is Neon Auth's httpOnly cookie; nothing auth-related is kept in localStorage.
 * Resolves to null when signed out (or not allowed in, e.g. a disabled account).
 */
let me: Promise<Profile | null> | null = null;

export function loadMe({ refresh = false }: { refresh?: boolean } = {}): Promise<Profile | null> {
  if (!me || refresh) {
    me = fetch("/api/auth/me", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<Profile>) : null))
      .catch(() => null);
  }
  return me;
}

export function forgetMe() {
  me = null;
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

/** After a successful sign-in: load the profile and go to that role's home page. */
export async function goHome(): Promise<boolean> {
  const profile = await loadMe({ refresh: true });
  if (!profile) return false;
  // Full navigation so every page starts from the new session.
  window.location.replace(homePathFor(profile.role));
  return true;
}
