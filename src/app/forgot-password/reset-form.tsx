"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth/client";

type Message = { text: string; type: "error" | "success" };

const MIN_PASSWORD = 8;

/**
 * Two steps, both handled by Neon Auth: email a 6-digit reset code, then set a new password with it.
 * (Codes work with Neon's shared email sender; reset *links* would need custom SMTP.)
 */
export function ResetForm() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function sendCode() {
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "forget-password" });
    if (error) throw new Error(authErrorMessage(error));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (step === "request") {
        await sendCode();
        setMessage({ text: "If that email has an account, we've sent it a 6-digit reset code.", type: "success" });
        setStep("reset");
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setMessage({ text: "Please enter the 6-digit code from the email.", type: "error" });
        return;
      }
      const { error } = await authClient.emailOtp.resetPassword({ email: email.trim(), otp: code, password });
      if (error) {
        setMessage({ text: authErrorMessage(error), type: "error" });
        return;
      }
      setMessage({ text: "Password reset successfully! Redirecting to login…", type: "success" });
      setTimeout(() => router.push("/login"), 2000);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : authErrorMessage(null), type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setMessage(null);
    setBusy(true);
    try {
      await sendCode();
      setMessage({ text: "We've sent you a new code.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : authErrorMessage(null), type: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="form-wrapper">
        <div className="text-center">
          <h1 className="title">Reset your Password</h1>
          <p className="subtitle">
            {step === "request"
              ? "Enter your email and we'll send you a reset code."
              : `Enter the code we sent to ${email.trim()} and choose a new password.`}
          </p>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="input-container">
            {step === "request" ? (
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Enter your email
                </label>
                <input
                  type="email"
                  id="email-address"
                  required
                  autoComplete="email"
                  placeholder="Enter your email"
                  className="input input-top"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <div>
                  <label htmlFor="reset-code" className="sr-only">
                    Reset code
                  </label>
                  <input
                    type="text"
                    id="reset-code"
                    required
                    placeholder="6-digit code from the email"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    className="input input-top"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </div>
                <div>
                  <label htmlFor="new-password" className="sr-only">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="new-password"
                    required
                    minLength={MIN_PASSWORD}
                    autoComplete="new-password"
                    placeholder={`New Password (at least ${MIN_PASSWORD} characters)`}
                    className="input input-bottom"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className={`message${message ? ` ${message.type}` : ""}`} role="status">
            {message?.text}
          </div>
          <div>
            <button type="submit" className="button" disabled={busy}>
              {busy ? "Please wait…" : step === "request" ? "Send Reset Code" : "Reset Password"}
            </button>
          </div>
        </form>
        <div className="text-center" style={{ marginTop: "1rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
          {step === "reset" && (
            <button type="button" className="link" onClick={() => void resend()} disabled={busy}>
              Send a new code
            </button>
          )}
          <Link href="/login" className="link">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
