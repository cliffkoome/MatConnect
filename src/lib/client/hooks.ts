"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";
import { getSession } from "./session";
import type { Profile, Role } from "./types";

/**
 * Client-side page guard (the API enforces the real authorisation). Returns true once a session
 * with an allowed role is present; otherwise redirects to /login.
 */
export function useRoleGuard(allowed: Role | Role[]): boolean {
  const key = (Array.isArray(allowed) ? allowed : [allowed]).join(",");
  const isAllowed = () => {
    const session = getSession();
    return Boolean(session && key.split(",").includes(session.role));
  };
  // Server render (and the hydration pass) always see `false`, so markup matches; the client then
  // re-renders with the real answer from localStorage.
  const ready = useSyncExternalStore(subscribeToStorage, isAllowed, () => false);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    if (hydrated && !ready) window.location.replace("/login");
  }, [hydrated, ready]);

  return ready;
}

const noopSubscribe = () => () => {};
function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The signed-in user's profile (null while loading or on error). */
export function useProfile(enabled = true) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api<Profile>("/api/auth/me", { signal: controller.signal })
      .then(setProfile)
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled]);
  return profile;
}

/** Runs `task` now and then every `intervalMs` while `enabled`, always using the latest callback. */
export function usePolling(task: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const latest = useRef(task);
  useEffect(() => {
    latest.current = task;
  });
  useEffect(() => {
    if (!enabled) return;
    void latest.current();
    const id = setInterval(() => void latest.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}

export const DEFAULT_AVATAR = "/images/pfp.jpg";
