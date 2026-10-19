import "server-only";
import type { User } from "@/generated/prisma/client";
import { Role } from "@/generated/prisma/enums";
import { tokens } from "@/server/auth/context";
import { dummyPasswordWork, hashPassword, verifyPassword } from "@/server/auth/password";
import { TokenError, issuedBeforeInvalidation } from "@/server/auth/tokens";
import { createTotpSecret, qrCodeDataUrl, verifyTotp } from "@/server/auth/totp";
import { db } from "@/server/db";
import { normalizePhoneNumber } from "@/server/domain/phone";
import { env } from "@/server/env";
import { HttpError, badRequest, forbidden, notFound, unauthorized } from "@/server/http/errors";
import { sendMail } from "@/server/integrations/mailer";
import type { LoginInput, RegisterInput, UpdateProfileInput } from "./auth.schemas";
import { isRevoked, revokeToken } from "./revocation";

export type Session = { accessToken: string; refreshToken: string; role: Role };
export type LoginResult = ({ twoFactorRequired: false } & Session) | { twoFactorRequired: true; tempToken: string };

export type PublicUser = Omit<User, "password" | "twoFactorSecret" | "googleId"> & { isGoogleUser: boolean };

/** Never send secrets to the client. */
export function toPublicUser(user: User): PublicUser {
  const { password: _password, twoFactorSecret: _secret, googleId, ...rest } = user;
  return { ...rest, isGoogleUser: Boolean(googleId) };
}

async function issueSession(user: Pick<User, "id" | "role" | "disabled" | "tokensValidFrom">): Promise<Session> {
  const t = tokens();
  const [accessToken, refreshToken] = await Promise.all([t.signAccess(user), t.signRefresh(user.id)]);
  return { accessToken, refreshToken, role: user.role };
}

const DISABLED_MESSAGE = "Your account has been disabled. Please contact an administrator.";

export async function login({ email, password }: LoginInput): Promise<LoginResult> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    await dummyPasswordWork();
    throw notFound("User not found");
  }
  if (user.disabled) throw forbidden(DISABLED_MESSAGE);
  if (!user.password) throw badRequest("Please sign in using Google.");
  if (!(await verifyPassword(password, user.password))) throw unauthorized("Invalid password");

  if (user.twoFactorEnabled) {
    return { twoFactorRequired: true, tempToken: await tokens().signTwoFactor(user.id) };
  }
  return { twoFactorRequired: false, ...(await issueSession(user)) };
}

export async function completeTwoFactorLogin(tempToken: string, code: string): Promise<Session> {
  let userId: number;
  try {
    ({ id: userId } = await tokens().verifyTwoFactor(tempToken));
  } catch (error) {
    if (error instanceof TokenError && error.reason === "expired") {
      throw unauthorized("2FA session expired, please log in again.");
    }
    throw unauthorized("Invalid 2FA session token.");
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw badRequest("2FA is not enabled for this user.");
  }
  if (user.disabled) throw forbidden(DISABLED_MESSAGE);
  if (!(await verifyTotp(user.twoFactorSecret, code))) throw badRequest("Invalid 2FA token");

  return issueSession(user);
}

/** Self-registration. The very first account becomes the Admin (bootstrap), everyone else a Passenger. */
export async function register({ name, email, password }: RegisterInput): Promise<PublicUser> {
  const hashed = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const role = (await tx.user.count()) === 0 ? Role.Admin : Role.Passenger;
    return tx.user.create({ data: { name, email, password: hashed, role } });
  });
  if (user.role === Role.Admin) console.info("[auth] first user registered — promoted to Admin");
  return toPublicUser(user);
}

/**
 * Refresh-token rotation. The caller must also present its (possibly expired) access token for the
 * same user: a cross-site request can carry the cookie but can't read the access token.
 */
export async function refreshSession(refreshToken: string | undefined, accessToken: string | undefined): Promise<Session> {
  if (!refreshToken) throw unauthorized("Refresh token missing");
  if (!accessToken) throw unauthorized("Access token missing for refresh");

  const t = tokens();
  let refresh;
  try {
    refresh = await t.verifyRefresh(refreshToken);
  } catch {
    throw new HttpError(403, "Invalid refresh token");
  }
  if (await isRevoked(refresh.jti)) throw unauthorized("Token has been invalidated");

  try {
    const access = await t.verifyAccess(accessToken, { allowExpired: true });
    if (access.id !== refresh.id) throw new HttpError(403, "Token mismatch");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unauthorized("Invalid access token for refresh");
  }

  const user = await db.user.findUnique({ where: { id: refresh.id } });
  if (!user || user.disabled) throw new HttpError(403, "User account is disabled or not found");
  if (issuedBeforeInvalidation(refresh.iat, user.tokensValidFrom.getTime())) {
    throw unauthorized("Token has been invalidated");
  }

  await revokeToken(refresh.jti, refresh.exp);
  return issueSession(user);
}

/** Revokes whichever tokens the client presents. Invalid tokens are ignored. */
export async function logout(accessToken: string | undefined, refreshToken: string | undefined): Promise<void> {
  const t = tokens();
  const tasks: Promise<void>[] = [];
  if (accessToken) {
    tasks.push(
      t.verifyAccess(accessToken, { allowExpired: true }).then(
        (c) => revokeToken(c.jti, c.exp),
        () => undefined,
      ),
    );
  }
  if (refreshToken) {
    tasks.push(
      t.verifyRefresh(refreshToken).then(
        (c) => revokeToken(c.jti, c.exp),
        () => undefined,
      ),
    );
  }
  await Promise.all(tasks);
}

export async function getProfile(userId: number): Promise<PublicUser> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found");
  return toPublicUser(user);
}

export async function updateProfile(userId: number, input: UpdateProfileInput): Promise<void> {
  const data: { name?: string; phoneNumber?: string | null } = {};
  if (input.name) data.name = input.name;
  if (input.phoneNumber !== undefined) {
    data.phoneNumber = input.phoneNumber === null ? null : normalizePhoneNumber(input.phoneNumber);
  }
  const { count } = await db.user.updateMany({ where: { id: userId }, data });
  if (count === 0) throw notFound("User not found");
}

const RESET_RESPONSE = "If an account with that email exists, a password reset link has been sent.";

export async function requestPasswordReset(email: string): Promise<string> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.password) {
    await dummyPasswordWork();
    return RESET_RESPONSE;
  }

  const token = await tokens().signReset({ id: user.id, email: user.email, password: user.password });
  const link = new URL("/forgot-password", env().APP_URL);
  link.searchParams.set("id", String(user.id));
  link.searchParams.set("token", token);

  await sendMail({
    to: user.email,
    subject: "Reset your MatConnect password",
    text: [
      "Someone asked to reset the password for your MatConnect account.",
      "If it wasn't you, you can ignore this email.",
      "",
      `Reset your password (valid for 1 hour): ${link.toString()}`,
      "",
      `Or paste these into the reset form — User ID: ${user.id}  Token: ${token}`,
    ].join("\n"),
  });

  return RESET_RESPONSE;
}

export async function resetPassword(userId: number, token: string, password: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.password) throw badRequest("Invalid or expired reset link.");
  try {
    const claims = await tokens().verifyReset(token, user.password);
    if (claims.id !== user.id) throw new Error("id mismatch");
  } catch {
    throw badRequest("Invalid or expired reset link.");
  }

  await db.user.update({
    where: { id: user.id },
    // Changing the hash also invalidates the reset token; bumping tokensValidFrom logs out everywhere.
    data: { password: await hashPassword(password), tokensValidFrom: new Date() },
  });
}

export async function beginTwoFactorSetup(userId: number) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found");
  if (user.twoFactorEnabled) throw badRequest("2FA is already enabled. Disable it first to re-enrol.");

  const { secret, otpauthUrl } = createTotpSecret(user.email);
  await db.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });
  return { secret, qrCodeUrl: await qrCodeDataUrl(otpauthUrl) };
}

export async function confirmTwoFactorSetup(userId: number, code: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.twoFactorSecret) throw badRequest("2FA not set up or user not found.");
  if (!(await verifyTotp(user.twoFactorSecret, code, 0))) throw badRequest("Invalid 2FA token");
  await db.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
}

export async function disableTwoFactor(userId: number): Promise<void> {
  const { count } = await db.user.updateMany({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  if (count === 0) throw notFound("User not found");
}

export type GoogleProfile = { sub: string; email: string; name: string; picture?: string };

/** Finds or creates the account for a verified Google identity and starts a session. */
export async function loginWithGoogle(profile: GoogleProfile): Promise<Session> {
  const email = profile.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });

  let user: User;
  if (existing) {
    user = existing.googleId
      ? existing
      : await db.user.update({
          where: { id: existing.id },
          data: { googleId: profile.sub, profilePictureUrl: existing.profilePictureUrl ?? profile.picture ?? null },
        });
  } else {
    user = await db.user.create({
      data: {
        googleId: profile.sub,
        name: profile.name || email,
        email,
        profilePictureUrl: profile.picture ?? null,
        role: Role.Passenger,
      },
    });
  }

  if (user.disabled) throw forbidden(DISABLED_MESSAGE);
  return issueSession(user);
}
