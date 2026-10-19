import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

/** Base32 secrets are interchangeable with the ones `speakeasy` generated, so existing 2FA users keep working. */
export function createTotpSecret(accountEmail: string) {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: "MatConnect", label: accountEmail, secret });
  return { secret, otpauthUrl };
}

export const qrCodeDataUrl = (otpauthUrl: string) => QRCode.toDataURL(otpauthUrl);

/**
 * @param toleranceSteps how many 30s steps either side to accept (1 = the original `window: 1`).
 */
export async function verifyTotp(secret: string, token: string, toleranceSteps = 1, epoch?: number) {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = await verify({ secret, token, epochTolerance: toleranceSteps * 30, epoch });
    return result.valid;
  } catch {
    return false;
  }
}
