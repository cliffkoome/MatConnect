import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { HttpError, forbidden, unauthorized } from "@/server/http/errors";
import { tokens } from "./context";
import { TokenError, issuedBeforeInvalidation, type AccessClaims } from "./tokens";

/** Extracts the bearer token, or throws the same 401/400 responses the Express middleware returned. */
export function bearerToken(headers: Headers): string {
  const header = headers.get("authorization");
  if (!header) throw unauthorized("Access denied. No token provided.");
  const [scheme, token, ...rest] = header.split(" ");
  if (scheme !== "Bearer" || !token || rest.length) throw new HttpError(400, "Invalid token format");
  return token;
}

/**
 * Verifies the access token and checks it against the claims-based rules:
 * disabled flag, tokensValidFrom invalidation, required role, and the revocation list (logout).
 */
export async function authenticate(headers: Headers, role?: Role): Promise<AccessClaims> {
  const token = bearerToken(headers);

  let claims: AccessClaims;
  try {
    claims = await tokens().verifyAccess(token);
  } catch (error) {
    if (error instanceof TokenError && error.reason === "expired") throw unauthorized("Token expired");
    throw unauthorized("Invalid token");
  }

  if (claims.disabled) throw forbidden("Account disabled");
  if (role && claims.role !== role) throw forbidden();

  // The Express version only compared the token against its *own* tokensValidFrom claim, which can
  // never change, so blocking a user or resetting a password didn't affect live access tokens.
  // Checking the current row makes both take effect immediately.
  const [user, revoked] = await Promise.all([
    db.user.findUnique({
      where: { id: claims.id },
      select: { disabled: true, tokensValidFrom: true, role: true },
    }),
    db.revokedToken.findUnique({ where: { jti: claims.jti }, select: { jti: true } }),
  ]);

  if (!user || revoked) throw unauthorized("Token has been invalidated");
  if (user.disabled) throw forbidden("Account disabled");
  if (user.role !== claims.role) throw unauthorized("Token has been invalidated");
  if (issuedBeforeInvalidation(claims.iat, user.tokensValidFrom.getTime())) {
    throw unauthorized("Token has been invalidated");
  }

  return claims;
}
