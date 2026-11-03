"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import "@/styles/pages/signup.css";
import { authClient, authErrorMessage } from "@/lib/auth/client";
import { useEmailVerification } from "@/lib/auth/use-email-verification";
import { goHome } from "@/lib/client/session";

const MIN_PASSWORD = 8;

export default function SignupPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [step, setStep] = useState<"details" | "verify">("details");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const verification = useEmailVerification(form.email.trim());

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);

    if (step === "verify") {
      const result = await verification.verify();
      if (!result.ok) setNotice({ text: result.message, ok: false });
      return;
    }

    if (form.password !== form.confirm) {
      setNotice({ text: "Passwords do not match.", ok: false });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await authClient.signUp.email({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      if (error) {
        setNotice({ text: authErrorMessage(error), ok: false });
        return;
      }
      // With "verify email at sign-up" on, Neon Auth returns no session and emails a code instead.
      if (data && "token" in data && data.token) {
        await goHome();
        return;
      }
      setStep("verify");
      setNotice({ text: `We've sent a 6-digit code to ${form.email.trim()}. Enter it to finish signing up.`, ok: true });
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    const result = await verification.resend();
    setNotice(result.ok ? { text: "We've sent you a new code.", ok: true } : { text: result.message, ok: false });
  }

  const pending = busy || verification.busy;

  return (
    <div className="page-signup">
      <title>Sign Up · MatConnect</title>
      <div className="container">
        <div className="form-wrapper">
          <div className="text-center">
            <h1 className="title">{step === "details" ? "Create an Account" : "Verify your Email"}</h1>
            <p className="subtitle">
              {step === "details" ? "Join MatConnect for real-time matatu updates." : "Check your inbox for the code."}
            </p>
          </div>
          {notice && (
            <p className="subtitle" role={notice.ok ? "status" : "alert"} style={{ color: notice.ok ? "#15803d" : "#dc2626" }}>
              {notice.text}
            </p>
          )}
          <form className="form" onSubmit={onSubmit}>
            <div className="input-group">
              {step === "details" ? (
                <>
                  <div>
                    <label htmlFor="full-name" className="sr-only">
                      Full Name
                    </label>
                    <input type="text" id="full-name" required placeholder="Full Name" autoComplete="name" className="input" value={form.name} onChange={update("name")} />
                  </div>
                  <div>
                    <label htmlFor="email-address" className="sr-only">
                      Email address
                    </label>
                    <input type="email" id="email-address" required placeholder="Email address" autoComplete="email" className="input" value={form.email} onChange={update("email")} />
                  </div>
                  <div>
                    <label htmlFor="password" className="sr-only">
                      Password
                    </label>
                    <input
                      type="password"
                      id="password"
                      required
                      minLength={MIN_PASSWORD}
                      placeholder={`Password (at least ${MIN_PASSWORD} characters)`}
                      autoComplete="new-password"
                      className="input"
                      value={form.password}
                      onChange={update("password")}
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="sr-only">
                      Confirm Password
                    </label>
                    <input type="password" id="confirm-password" required placeholder="Confirm Password" autoComplete="new-password" className="input" value={form.confirm} onChange={update("confirm")} />
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
                    required
                    placeholder="6-digit code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    className="input"
                    value={verification.code}
                    onChange={(e) => verification.setCode(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div>
              <button type="submit" className="button" disabled={pending}>
                {pending ? "Please wait…" : step === "details" ? "Sign Up" : "Verify & Continue"}
              </button>
            </div>
          </form>
          <div className="link">
            {step === "details" ? (
              <Link href="/login">Already have an account? Log in</Link>
            ) : (
              <a href="#" onClick={(e) => (e.preventDefault(), void resendCode())}>
                Didn&apos;t get it? Send a new code
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
