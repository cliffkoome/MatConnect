"use client";

import { useEffect } from "react";
import { homePathFor, setSession } from "@/lib/client/session";
import type { Role } from "@/lib/client/types";

const ROLES: Role[] = ["Passenger", "Admin", "MatAdmin"];

/**
 * Landing page after Google sign-in. The server puts the access token in the URL *fragment*
 * (#accessToken=…&role=…). The old page read the query string instead, so this flow was broken.
 */
export default function AuthSuccessPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("accessToken");
    const role = params.get("role") as Role | null;
    // Remove the token from the address bar / history straight away.
    window.history.replaceState(null, "", window.location.pathname);

    if (accessToken && role && ROLES.includes(role)) {
      setSession(accessToken, role);
      window.location.replace(homePathFor(role));
    } else {
      window.location.replace("/login?error=auth_failed");
    }
  }, []);

  return (
    <main style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <title>Signing in… · MatConnect</title>
      <p>Please wait, you are being redirected…</p>
    </main>
  );
}
