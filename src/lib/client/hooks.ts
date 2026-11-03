"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { loadMe } from "./session";
import type { Profile, Role } from "./types";

/**
 * Client-side page guard (the API enforces the real authorisation). Returns true once the signed-in
 * user's role is allowed; otherwise redirects to /login. Server render and hydration see `false`.
 */
export function useRoleGuard(allowed: Role | Role[]): boolean {
  const key = (Array.isArray(allowed) ? allowed : [allowed]).join(",");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void loadMe().then((me) => {
      if (!active) return;
      if (me && key.split(",").includes(me.role)) setReady(true);
      else window.location.replace("/login");
    });
    return () => {
      active = false;
    };
  }, [key]);

  return ready;
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
