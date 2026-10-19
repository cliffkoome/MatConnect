"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { homePathFor, setSession } from "@/lib/client/session";
import type { LoginResponse, Role } from "@/lib/client/types";

const OAUTH_ERRORS: Record<string, string> = {
  auth_failed: "Authentication failed. Please try again.",
  account_disabled: "Your account has been disabled. Please contact an administrator.",
  google_unavailable: "Google sign-in is not configured on this server.",
};

type Message = { text: string; type: "error" | "success" | "info" };

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const oauthError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(
    oauthError
      ? { text: OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.auth_failed!, type: "error" }
      : params.get("registered")
        ? { text: "Account created — please log in.", type: "success" }
        : null,
  );

  const finish = (accessToken: string, role: Role) => {
    setSession(accessToken, role);
    router.replace(homePathFor(role));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (tempToken) {
        if (!/^\d{6}$/.test(code)) {
          setMessage({ text: "Please enter a valid 6-digit code.", type: "error" });
          return;
        }
        try {
          const data = await api<{ accessToken: string; role: Role }>("/api/auth/2fa/login", {
            method: "POST",
            auth: false,
            body: { tempToken, token: code },
          });
          finish(data.accessToken, data.role);
        } catch (error) {
          setMessage({ text: errorMessage(error), type: "error" });
          setCode("");
        }
        return;
      }

      const data = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        auth: false,
        body: { email, password },
      });
      if (data.twoFactorRequired) {
        setTempToken(data.tempToken);
      } else {
        finish(data.accessToken, data.role);
      }
    } catch (error) {
      setMessage({ text: errorMessage(error), type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="form-wrapper">
        <div className="text-center">
          <h1 className="title">Welcome Back to MatConnect</h1>
          <p className="subtitle">
            {tempToken ? "Enter the 6-digit code from your authenticator app." : "Sign in to continue"}
          </p>
        </div>

        {message && (
          <div className={`message ${message.type}`} role="alert">
            {message.text}
          </div>
        )}

        <form className="form" onSubmit={onSubmit}>
          <div className="input-container">
            {!tempToken ? (
              <>
                <div>
                  <label htmlFor="email-address" className="sr-only">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email-address"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="Email"
                    className="input input-top"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="password" className="sr-only">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    placeholder="Password"
                    autoComplete="current-password"
                    className="input input-bottom"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="two-factor-token" className="sr-only">
                  2FA code
                </label>
                <input
                  type="text"
                  id="two-factor-token"
                  name="two-factor-token"
                  placeholder="6-digit code from your app"
                  autoComplete="one-time-code"
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            )}
          </div>
          <div className="flex-between">
            <div className="text-sm">
              <Link href="/forgot-password" className="link">
                Forgot Password?
              </Link>
            </div>
          </div>
          <div>
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Please wait…" : tempToken ? "Verify Code" : "Login"}
            </button>
          </div>
        </form>

        {!tempToken && (
          <>
            <div className="divider">
              <span>OR</span>
            </div>
            <div>
              <button
                type="button"
                className="button google-button"
                // An API route that redirects to Google, so it must be a full navigation.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                onClick={() => (window.location.href = "/api/auth/google")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="" width={20} height={20} /> Sign in
                with Google
              </button>
            </div>
          </>
        )}

        <p className="footer-text">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="link">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
