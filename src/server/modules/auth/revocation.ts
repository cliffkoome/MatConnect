import "server-only";
import { db } from "@/server/db";

/** Adds a token id to the revocation list until the token would have expired anyway. */
export async function revokeToken(jti: string | undefined, expSeconds: number | undefined): Promise<void> {
  if (!jti || !expSeconds) return;
  const expiresAt = new Date(expSeconds * 1000);
  if (expiresAt.getTime() <= Date.now()) return;
  await db.revokedToken.upsert({ where: { jti }, create: { jti, expiresAt }, update: {} });
}

export async function isRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  return (await db.revokedToken.count({ where: { jti } })) > 0;
}

export async function purgeExpiredRevocations(now = new Date()): Promise<number> {
  const { count } = await db.revokedToken.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}
