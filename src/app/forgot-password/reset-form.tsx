"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/client/api";

type Message = { text: string; type: "error" | "success" };

/**
 * Two steps: request a reset email, then set a new password. Opening the emailed link pre-fills
 * the user ID and token (the manual copy-paste flow from the old page still works).
 */
export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const linkId = params.get("id") ?? "";
  const linkToken = params.get("token") ?? "";

  const [step, setStep] = useState<"request" | "reset">(linkId && linkToken ? "reset" : "request");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState(linkId);
  const [token, setToken] = useState(linkToken);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (step === "request") {
        await api("/api/auth/requestPasswordReset", { method: "POST", auth: false, body: { email } });
        setMessage({
          text: "If that email has an account, we've sent a reset link. Open it, or paste the ID and token from the email below.",
          type: "success",
        });
        setStep("reset");
      } else {
        if (!userId || !token || !password) {
          setMessage({ text: "Please fill in your User ID, Token, and a new password.", type: "error" });
          return;
        }
        await api(`/api/auth/resetpassword/${encodeURIComponent(userId)}/${encodeURIComponent(token)}`, {
          method: "POST",
          auth: false,
          body: { password },
        });
        setMessage({ text: "Password reset successfully! Redirecting to login…", type: "success" });
        setTimeout(() => router.push("/login"), 2000);
      }
    } catch (error) {
      setMessage({ text: errorMessage(error), type: "error" });
    } finally {
      setBusy(false);
    }
  }

  const fromLink = Boolean(linkId && linkToken);

  return (
    <div className="container">
      <div className="form-wrapper">
        <div className="text-center">
          <h1 className="title">Reset your Password</h1>
          <p className="subtitle">
            {step === "request" ? "Enter your email and we'll send you a reset link." : "Choose a new password."}
          </p>
        </div>
        <form className="form" onSubmit={onSubmit}>
          <div className="input-container">
            {step === "request" && (
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Enter your email
                </label>
                <input
                  type="email"
                  id="email-address"
                  required
                  placeholder="Enter your email"
                  className="input input-top"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            {step === "reset" && (
              <div>
                {!fromLink && (
                  <>
                    <div>
                      <label htmlFor="reset-token" className="sr-only">
                        Token
                      </label>
                      <input
                        type="text"
                        id="reset-token"
                        placeholder="Paste Token from Email"
                        className="input"
                        value={token}
                        onChange={(e) => setToken(e.target.value.trim())}
                      />
                    </div>
                    <div>
                      <label htmlFor="user-id" className="sr-only">
                        User ID
                      </label>
                      <input
                        type="text"
                        id="user-id"
                        inputMode="numeric"
                        placeholder="Paste User ID from Email"
                        className="input"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value.trim())}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label htmlFor="new-password" className="sr-only">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="new-password"
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="New Password"
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
              {busy ? "Please wait…" : step === "request" ? "Send Reset Link" : "Reset Password"}
            </button>
          </div>
        </form>
        <div className="text-center" style={{ marginTop: "1rem" }}>
          <Link href="/login" className="link">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
