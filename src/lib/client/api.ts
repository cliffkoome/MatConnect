"use client";

import { clearSession, getSession, setSession } from "./session";
import type { FieldError, Role } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Attach the bearer token, refresh once on 401, and send the user to /login if that fails. */
  auth?: boolean;
  /** Set false on public pages that only *peek* at the session (e.g. the landing page). */
  redirectOnAuthFailure?: boolean;
  signal?: AbortSignal;
};

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    const session = getSession();
    if (!session) return false;
    try {
      const res = await fetch("/api/auth/refresh-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.accessToken}` },
        credentials: "same-origin",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string; role: Role };
      setSession(data.accessToken, data.role);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

function firstMessage(data: unknown, fallback: string): { message: string; errors: FieldError[] } {
  const d = (data ?? {}) as { message?: string; errors?: FieldError[] };
  const errors = Array.isArray(d.errors) ? d.errors : [];
  // Prefer the specific field message ("Password must be…") over the generic "Validation failed".
  const message = d.message === "Validation failed" && errors[0] ? errors[0].message : (d.message ?? fallback);
  return { message, errors };
}

export function redirectToLogin() {
  clearSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    // Full reload on purpose: drops every piece of in-memory state from the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

export async function api<T>(path: string, { method = "GET", body, auth = true, redirectOnAuthFailure = true, signal }: RequestOptions = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = auth ? getSession()?.accessToken : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  };

  let res = await send();
  if (auth && res.status === 401 && (await refreshAccessToken())) {
    res = await send();
  }

  const data: unknown = res.headers.get("content-type")?.includes("application/json")
    ? await res.json().catch(() => null)
    : null;

  if (!res.ok) {
    if (auth && redirectOnAuthFailure && (res.status === 401 || res.status === 403)) redirectToLogin();
    const { message, errors } = firstMessage(data, `Request failed (${res.status})`);
    throw new ApiError(res.status, message, errors);
  }
  return data as T;
}

/** Best-effort server-side logout, then forget the local session. */
export async function logout() {
  const session = getSession();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: session ? { Authorization: `Bearer ${session.accessToken}` } : {},
      credentials: "same-origin",
    });
  } catch {
    // Offline or server error: still clear the local session below.
  } finally {
    clearSession();
    // Full reload on purpose: drops every piece of in-memory state from the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
