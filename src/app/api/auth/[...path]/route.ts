import { neonAuth } from "@/server/auth/neon";

/**
 * Same-origin proxy to Neon Auth: sign-up, sign-in (email + Google), sign-out, sessions, email
 * verification and password-reset codes. The browser client (`@neon/auth/next`) talks to this.
 * App routes under /api/auth (e.g. /api/auth/me) are more specific, so Next.js serves them first.
 *
 * The handler is resolved per request so `next build` doesn't need the Neon Auth secrets.
 */
type Handlers = ReturnType<ReturnType<typeof neonAuth>["handler"]>;
type Context = Parameters<Handlers["GET"]>[1];

const forward = (method: keyof Handlers) => (request: Request, context: Context) =>
  neonAuth().handler()[method](request, context);

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const DELETE = forward("DELETE");
export const PATCH = forward("PATCH");
