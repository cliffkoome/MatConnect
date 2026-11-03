import type { NextRequest } from "next/server";
import { neonAuth } from "@/server/auth/neon";

/**
 * Neon Auth middleware for pages: completes the Google sign-in hand-off (session verifier → cookie),
 * refreshes the session, and sends signed-out visitors of signed-in pages to /login.
 * Role checks stay in the pages (useRoleGuard) and, authoritatively, in the API (route guard).
 */
let middleware: ((request: NextRequest) => Promise<Response>) | undefined;

export default function proxy(request: NextRequest) {
  middleware ??= neonAuth().middleware({
    loginUrl: "/login",
    publicRoutes: ["/", "/login", "/signup", "/forgot-password"],
  });
  return middleware(request);
}

export const config = {
  // API routes authenticate themselves (JSON 401/403, not redirects); static files need no session.
  matcher: ["/((?!api/|_next/static|_next/image|images/|favicon.ico).*)"],
};
