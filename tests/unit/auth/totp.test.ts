import { ScureBase32Plugin, generate } from "otplib";
import { describe, expect, it } from "vitest";
import { createTotpSecret, qrCodeDataUrl, verifyTotp } from "@/server/auth/totp";

const EPOCH = 1_800_000_000; // fixed clock (seconds)

describe("TOTP", () => {
  it("creates a base32 secret and an otpauth URL for the account", () => {
    const { secret, otpauthUrl } = createTotpSecret("ada@example.com");
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain("issuer=MatConnect");
    expect(decodeURIComponent(otpauthUrl)).toContain("ada@example.com");
  });

  it("accepts the current code", async () => {
    const { secret } = createTotpSecret("a@b.co");
    const code = await generate({ secret, epoch: EPOCH });
    expect(await verifyTotp(secret, code, 1, EPOCH)).toBe(true);
  });

  it("accepts one step of clock drift by default, but not two", async () => {
    const { secret } = createTotpSecret("a@b.co");
    const previous = await generate({ secret, epoch: EPOCH - 30 });
    const older = await generate({ secret, epoch: EPOCH - 90 });
    expect(await verifyTotp(secret, previous, 1, EPOCH)).toBe(true);
    expect(await verifyTotp(secret, older, 1, EPOCH)).toBe(false);
  });

  it("is strict during enrolment (tolerance 0)", async () => {
    const { secret } = createTotpSecret("a@b.co");
    const previous = await generate({ secret, epoch: EPOCH - 30 });
    expect(await verifyTotp(secret, previous, 0, EPOCH)).toBe(false);
  });

  it.each(["", "12345", "1234567", "abcdef", "12 456"])("rejects malformed code %j without throwing", async (code) => {
    const { secret } = createTotpSecret("a@b.co");
    expect(await verifyTotp(secret, code)).toBe(false);
  });

  it("works with secrets created by the old speakeasy implementation", async () => {
    // speakeasy.generateSecret() defaulted to 32 ASCII symbols, base32-encoded without padding.
    const ascii = "x!3k9#Lm2@pQ7$wE5^rT1&yU8*iO4(aS";
    const speakeasySecret = new ScureBase32Plugin().encode(new TextEncoder().encode(ascii)).replace(/=+$/, "");
    const code = await generate({ secret: speakeasySecret, epoch: EPOCH });
    expect(await verifyTotp(speakeasySecret, code, 1, EPOCH)).toBe(true);
  });

  it("renders a QR code data URL", async () => {
    await expect(qrCodeDataUrl("otpauth://totp/x?secret=JBSWY3DPEHPK3PXP")).resolves.toMatch(/^data:image\/png;base64,/);
  });
});
