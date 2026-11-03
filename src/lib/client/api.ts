"use client";

import { authClient } from "@/lib/auth/client";
import { forgetMe } from "./session";
import type { FieldError } from "./types";

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
  /** A signed-in request: on 401/403 send the user to /login. (The session cookie is always sent.) */
  auth?: boolean;
  /** Set false on public pages that only *peek* at the session (e.g. the landing page). */
  redirectOnAuthFailure?: boolean;
  signal?: AbortSignal;
};

function firstMessage(data: unknown, fallback: string): { message: string; errors: FieldError[] } {
  const d = (data ?? {}) as { message?: string; errors?: FieldError[] };
  const errors = Array.isArray(d.errors) ? d.errors : [];
  // Prefer the specific field message ("Password must be…") over the generic "Validation failed".
  const message = d.message === "Validation failed" && errors[0] ? errors[0].message : (d.message ?? fallback);
  return { message, errors };
}

export function redirectToLogin() {
  forgetMe();
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
    return fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  };

  const res = await send();

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

/** Signs out of Neon Auth (clears the session cookies), then reloads on the login page. */
export async function logout() {
  try {
    await authClient.signOut();
  } catch {
    // Offline or server error: still leave the signed-in pages below.
  } finally {
    forgetMe();
    // Full reload on purpose: drops every piece of in-memory state from the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
