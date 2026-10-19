import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { TokenError, createTokenService, issuedBeforeInvalidation } from "@/server/auth/tokens";

const secrets = {
  accessSecret: "unit-access-secret-0123456789abcdefghij",
  refreshSecret: "unit-refresh-secret-0123456789abcdefghij",
};
const t = createTokenService(secrets);
const user = { id: 7, role: "Passenger" as const, disabled: false, tokensValidFrom: new Date("2026-01-01T00:00:00Z") };

const expectTokenError = async (promise: Promise<unknown>, reason: TokenError["reason"]) => {
  await expect(promise).rejects.toBeInstanceOf(TokenError);
  await expect(promise).rejects.toMatchObject({ reason });
};

describe("access tokens", () => {
  it("round-trips the claims", async () => {
    const claims = await t.verifyAccess(await t.signAccess(user));
    expect(claims).toMatchObject({
      typ: "access",
      id: 7,
      role: "Passenger",
      disabled: false,
      tokensValidFrom: user.tokensValidFrom.getTime(),
    });
    expect(claims.jti).toMatch(/[0-9a-f-]{36}/);
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it("rejects a token signed with another secret", async () => {
    const other = createTokenService({ ...secrets, accessSecret: "another-secret-0123456789abcdefghijkl" });
    await expectTokenError(t.verifyAccess(await other.signAccess(user)), "invalid");
  });

  it("rejects expired tokens unless explicitly allowed (refresh flow)", async () => {
    const expired = await new SignJWT({ typ: "access", id: 7, role: "Passenger" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3_600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setJti("old")
      .sign(new TextEncoder().encode(secrets.accessSecret));

    await expectTokenError(t.verifyAccess(expired), "expired");
    await expect(t.verifyAccess(expired, { allowExpired: true })).resolves.toMatchObject({ id: 7, jti: "old" });
  });

  it("rejects a forged 'none' token", async () => {
    const [, payload] = (await t.signAccess(user)).split(".");
    const forged = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${payload}.`;
    await expectTokenError(t.verifyAccess(forged), "invalid");
  });
});

describe("token types cannot be swapped", () => {
  it("does not accept a 2FA temp token as an access token (regression)", async () => {
    // The Express app signed the temp token with the access secret and no type claim, so it
    // passed the auth middleware — skipping the second factor entirely.
    const temp = await t.signTwoFactor(7);
    await expectTokenError(t.verifyAccess(temp), "wrong-type");
    await expect(t.verifyTwoFactor(temp)).resolves.toMatchObject({ typ: "2fa", id: 7 });
  });

  it("does not accept an access token as a 2FA temp token", async () => {
    await expectTokenError(t.verifyTwoFactor(await t.signAccess(user)), "wrong-type");
  });

  it("keeps refresh tokens on their own secret", async () => {
    const refresh = await t.signRefresh(7);
    await expectTokenError(t.verifyAccess(refresh), "invalid");
    const claims = await t.verifyRefresh(refresh);
    expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
  });
});

describe("password reset tokens", () => {
  it("only verify against the password hash they were issued for", async () => {
    const token = await t.signReset({ id: 7, email: "a@b.co", password: "$2b$10$old" });
    await expect(t.verifyReset(token, "$2b$10$old")).resolves.toMatchObject({ id: 7, email: "a@b.co" });
    // Once the password changes, the same link stops working.
    await expectTokenError(t.verifyReset(token, "$2b$10$new"), "invalid");
  });
});

describe("issuedBeforeInvalidation", () => {
  it("compares at second precision", () => {
    const validFrom = Date.parse("2026-01-01T00:00:10.900Z");
    expect(issuedBeforeInvalidation(Date.parse("2026-01-01T00:00:09Z") / 1000, validFrom)).toBe(true);
    // Same second as the invalidation: a token minted right after a password reset must work.
    expect(issuedBeforeInvalidation(Date.parse("2026-01-01T00:00:10Z") / 1000, validFrom)).toBe(false);
    expect(issuedBeforeInvalidation(Date.parse("2026-01-01T00:00:11Z") / 1000, validFrom)).toBe(false);
  });
});
