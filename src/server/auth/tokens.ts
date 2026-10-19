import { SignJWT, errors as joseErrors, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/generated/prisma/enums";

/**
 * JWT handling.
 *
 * Every token carries a `typ` claim so one kind can never be replayed as another. (The original
 * app signed the 2FA "temp token" with the access-token secret and no type, so it was accepted
 * as a full access token — bypassing the second factor.)
 */

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const TWO_FACTOR_TOKEN_TTL = "5m";
export const RESET_TOKEN_TTL = "1h";

export type AccessClaims = {
  typ: "access";
  id: number;
  role: Role;
  disabled: boolean;
  /** Epoch milliseconds; tokens issued before this are rejected. */
  tokensValidFrom: number;
  jti: string;
  iat: number;
  exp: number;
};

export type RefreshClaims = { typ: "refresh"; id: number; jti: string; iat: number; exp: number };
export type TwoFactorClaims = { typ: "2fa"; id: number; iat: number; exp: number };
export type ResetClaims = { typ: "reset"; id: number; email: string; iat: number; exp: number };

export type TokenUser = {
  id: number;
  role: Role;
  disabled: boolean;
  tokensValidFrom: Date;
};

export class TokenError extends Error {
  constructor(
    readonly reason: "expired" | "invalid" | "wrong-type",
    message: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}

const encoder = new TextEncoder();
const key = (secret: string) => encoder.encode(secret);
const newJti = () => crypto.randomUUID();

async function sign(payload: JWTPayload, secret: string, expiresIn: string | number, jti?: string) {
  let jwt = new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  jwt = typeof expiresIn === "number" ? jwt.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn) : jwt.setExpirationTime(expiresIn);
  if (jti) jwt = jwt.setJti(jti);
  return jwt.sign(key(secret));
}

async function verify<T extends { typ: string }>(
  token: string,
  secret: string,
  typ: T["typ"],
  { allowExpired = false } = {},
): Promise<T> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] }));
  } catch (error) {
    // jose verifies the signature before checking `exp`, so an expired token's payload is authentic.
    if (allowExpired && error instanceof joseErrors.JWTExpired) {
      payload = error.payload;
    } else if (error instanceof joseErrors.JWTExpired) {
      throw new TokenError("expired", "Token expired");
    } else {
      throw new TokenError("invalid", "Invalid token");
    }
  }
  if (payload.typ !== typ) throw new TokenError("wrong-type", "Invalid token type");
  return payload as unknown as T;
}

/** True when the token was issued before the user's tokens were invalidated. */
export function issuedBeforeInvalidation(iatSeconds: number, tokensValidFromMs: number): boolean {
  // `iat` has second precision; compare at second precision so a token minted in the same
  // second as a password reset / unblock is not spuriously rejected.
  return iatSeconds < Math.floor(tokensValidFromMs / 1000);
}

export type TokenSecrets = { accessSecret: string; refreshSecret: string };

export function createTokenService({ accessSecret, refreshSecret }: TokenSecrets) {
  return {
    signAccess(user: TokenUser) {
      return sign(
        {
          typ: "access",
          id: user.id,
          role: user.role,
          disabled: user.disabled,
          tokensValidFrom: user.tokensValidFrom.getTime(),
        },
        accessSecret,
        ACCESS_TOKEN_TTL,
        newJti(),
      );
    },
    verifyAccess: (token: string, opts?: { allowExpired?: boolean }) =>
      verify<AccessClaims>(token, accessSecret, "access", opts),

    signRefresh: (userId: number) =>
      sign({ typ: "refresh", id: userId }, refreshSecret, REFRESH_TOKEN_TTL_SECONDS, newJti()),
    verifyRefresh: (token: string) => verify<RefreshClaims>(token, refreshSecret, "refresh"),

    signTwoFactor: (userId: number) => sign({ typ: "2fa", id: userId }, accessSecret, TWO_FACTOR_TOKEN_TTL),
    verifyTwoFactor: (token: string) => verify<TwoFactorClaims>(token, accessSecret, "2fa"),

    /** Reset tokens are bound to the current password hash, so they stop working once used. */
    signReset: (user: { id: number; email: string; password: string }) =>
      sign({ typ: "reset", id: user.id, email: user.email }, accessSecret + user.password, RESET_TOKEN_TTL),
    verifyReset: (token: string, passwordHash: string) =>
      verify<ResetClaims>(token, accessSecret + passwordHash, "reset"),
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
