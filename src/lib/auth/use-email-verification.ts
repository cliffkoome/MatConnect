"use client";

import { useState } from "react";
import { goHome } from "@/lib/client/session";
import { authClient, authErrorMessage } from "./client";

export type VerificationResult = { ok: true } | { ok: false; message: string };

/**
 * Email verification with a 6-digit code (Neon Auth sends it on sign-up, and on sign-in while the
 * email is unverified). Verifying signs the user in, then this sends them to their home page.
 */
export function useEmailVerification(email: string) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(): Promise<VerificationResult> {
    if (!/^\d{6}$/.test(code)) return { ok: false, message: "Please enter the 6-digit code from the email." };
    setBusy(true);
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp: code });
      if (error) {
        setCode("");
        return { ok: false, message: authErrorMessage(error) };
      }
      if (!(await goHome())) return { ok: false, message: "Email verified. Please sign in." };
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }

  async function resend(): Promise<VerificationResult> {
    setBusy(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
      return error ? { ok: false, message: authErrorMessage(error) } : { ok: true };
    } finally {
      setBusy(false);
    }
  }

  return { code, setCode: (value: string) => setCode(value.replace(/\D/g, "").slice(0, 6)), busy, verify, resend };
}
