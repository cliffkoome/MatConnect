"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { goHome } from "@/lib/client/session";

/**
 * Landing page after Google sign-in. Neon Auth has already set the session cookie; this loads the
 * app profile (creating or linking the MatConnect account on first sign-in) and goes to its home page.
 */
export default function AuthSuccessPage() {
  useEffect(() => {
    void goHome().then(async (ok) => {
      if (ok) return;
      // Signed in to Neon Auth but the API refused the account (e.g. blocked by an Admin).
      await authClient.signOut().catch(() => undefined);
      window.location.replace("/login?error=account_disabled");
    });
  }, []);

  return (
    <main style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <title>Signing in… · MatConnect</title>
      <p>Please wait, you are being redirected…</p>
    </main>
  );
}
