"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import "@/styles/pages/signup.css";
import { api, errorMessage } from "@/lib/client/api";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        auth: false,
        body: { name: form.name.trim(), email: form.email.trim(), password: form.password },
      });
      router.push("/login?registered=1");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-signup">
      <title>Sign Up · MatConnect</title>
      <div className="container">
        <div className="form-wrapper">
          <div className="text-center">
            <h1 className="title">Create an Account</h1>
            <p className="subtitle">Join MatConnect for real-time matatu updates.</p>
          </div>
          {error && (
            <p className="subtitle" role="alert" style={{ color: "#dc2626" }}>
              {error}
            </p>
          )}
          <form className="form" onSubmit={onSubmit}>
            <div className="input-group">
              <div>
                <label htmlFor="full-name" className="sr-only">
                  Full Name
                </label>
                <input type="text" id="full-name" required placeholder="Full Name" className="input" value={form.name} onChange={update("name")} />
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
                <input type="password" id="password" required minLength={6} placeholder="Password" autoComplete="new-password" className="input" value={form.password} onChange={update("password")} />
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">
                  Confirm Password
                </label>
                <input type="password" id="confirm-password" required placeholder="Confirm Password" autoComplete="new-password" className="input" value={form.confirm} onChange={update("confirm")} />
              </div>
            </div>
            <div>
              <button type="submit" className="button" disabled={busy}>
                {busy ? "Creating account…" : "Sign Up"}
              </button>
            </div>
          </form>
          <div className="link">
            <Link href="/login">Already have an account? Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
