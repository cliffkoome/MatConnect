"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage, isEmailNotVerified } from "@/lib/auth/client";
import { useEmailVerification } from "@/lib/auth/use-email-verification";
import { goHome } from "@/lib/client/session";

const OAUTH_ERRORS: Record<string, string> = {
  auth_failed: "Authentication failed. Please try again.",
  account_disabled: "Your account has been disabled. Please contact an administrator.",
};

type Message = { text: string; type: "error" | "success" | "info" };

export function LoginForm() {
  const params = useSearchParams();
  const oauthError = params.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(
    oauthError ? { text: OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.auth_failed!, type: "error" } : null,
  );
  const verification = useEmailVerification(email.trim());

  async function finishSignIn() {
    if (await goHome()) return;
    // Signed in to Neon Auth, but the API refused the account (e.g. blocked by an Admin).
    await authClient.signOut().catch(() => undefined);
    setMessage({ text: OAUTH_ERRORS.account_disabled!, type: "error" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (verifying) {
      const result = await verification.verify();
      if (!result.ok) setMessage({ text: result.message, type: "error" });
      return;
    }

    setBusy(true);
    try {
      const { error } = await authClient.signIn.email({ email: email.trim(), password });
      if (isEmailNotVerified(error)) {
        // Neon Auth emails a fresh code on every sign-in attempt while the email is unverified.
        setVerifying(true);
        setMessage({ text: `Please verify your email first: we've sent a 6-digit code to ${email.trim()}.`, type: "info" });
        return;
      }
      if (error) {
        setMessage({ text: authErrorMessage(error), type: "error" });
        return;
      }
      await finishSignIn();
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    const result = await verification.resend();
    setMessage(result.ok ? { text: "We've sent you a new code.", type: "success" } : { text: result.message, type: "error" });
  }

  async function signInWithGoogle() {
    setMessage(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/auth/success",
      errorCallbackURL: "/login?error=auth_failed",
    });
    if (error) setMessage({ text: authErrorMessage(error), type: "error" });
  }

  const pending = busy || verification.busy;

  return (
    <div className="container">
      <div className="form-wrapper">
        <div className="text-center">
          <h1 className="title">Welcome Back to MatConnect</h1>
          <p className="subtitle">{verifying ? "Enter the 6-digit code we emailed you." : "Sign in to continue"}</p>
        </div>

        {message && (
          <div className={`message ${message.type}`} role="alert">
            {message.text}
          </div>
        )}

        <form className="form" onSubmit={onSubmit}>
          <div className="input-container">
            {!verifying ? (
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
                <label htmlFor="verification-code" className="sr-only">
                  Verification code
                </label>
                <input
                  type="text"
                  id="verification-code"
                  name="verification-code"
                  placeholder="6-digit code from the email"
                  autoComplete="one-time-code"
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  value={verification.code}
                  onChange={(e) => verification.setCode(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="flex-between">
            <div className="text-sm">
              {verifying ? (
                <button type="button" className="link" onClick={() => void resendCode()} disabled={pending}>
                  Send a new code
                </button>
              ) : (
                <Link href="/forgot-password" className="link">
                  Forgot Password?
                </Link>
              )}
            </div>
          </div>
          <div>
            <button type="submit" className="button" disabled={pending}>
              {pending ? "Please wait…" : verifying ? "Verify Email" : "Login"}
            </button>
          </div>
        </form>

        {!verifying && (
          <>
            <div className="divider">
              <span>OR</span>
            </div>
            <div>
              <button type="button" className="button google-button" onClick={() => void signInWithGoogle()}>
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
