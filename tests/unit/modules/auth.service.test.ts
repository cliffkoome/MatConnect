import { generate } from "otplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dbMock, resetDbMock } from "../../support/db-mock";
import { PASSWORD, passwordHash, userRow } from "../../support/fixtures";

vi.mock("@/server/db", async () => (await import("../../support/db-mock")).dbModule);
vi.mock("@/server/integrations/mailer", () => ({ sendMail: vi.fn(async () => true) }));

const { tokens } = await import("@/server/auth/context");
const { sendMail } = await import("@/server/integrations/mailer");
const auth = await import("@/server/modules/auth/auth.service");

beforeEach(() => {
  resetDbMock();
});

describe("login", () => {
  it("returns a session for valid credentials", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 5, password: await passwordHash() }));
    const result = await auth.login({ email: "ada@example.com", password: PASSWORD });
    expect(result.twoFactorRequired).toBe(false);
    if (result.twoFactorRequired) return;
    expect(result.role).toBe("Passenger");
    await expect(tokens().verifyAccess(result.accessToken)).resolves.toMatchObject({ id: 5 });
    await expect(tokens().verifyRefresh(result.refreshToken)).resolves.toMatchObject({ id: 5 });
  });

  it("asks for the second factor when 2FA is on, without issuing a session", async () => {
    dbMock.user.findUnique.mockResolvedValue(
      userRow({ id: 5, password: await passwordHash(), twoFactorEnabled: true, twoFactorSecret: "X" }),
    );
    const result = await auth.login({ email: "ada@example.com", password: PASSWORD });
    expect(result).toEqual({ twoFactorRequired: true, tempToken: expect.any(String) });
  });

  it.each([
    ["unknown user", null, 404, "User not found"],
    ["disabled account", { disabled: true }, 403, "Your account has been disabled. Please contact an administrator."],
    ["Google-only account", { password: null }, 400, "Please sign in using Google."],
  ] as const)("rejects %s", async (_label, overrides, status, message) => {
    dbMock.user.findUnique.mockResolvedValue(overrides === null ? null : userRow({ ...overrides }));
    await expect(auth.login({ email: "x@y.z", password: PASSWORD })).rejects.toMatchObject({ status, message });
  });

  it("rejects a wrong password with 401", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ password: await passwordHash() }));
    await expect(auth.login({ email: "ada@example.com", password: "wrong-pass" })).rejects.toMatchObject({ status: 401 });
  });
});

describe("completeTwoFactorLogin", () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // 20-byte base32

  it("issues a session for a valid code", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 9, twoFactorEnabled: true, twoFactorSecret: secret }));
    const temp = await tokens().signTwoFactor(9);
    const session = await auth.completeTwoFactorLogin(temp, await generate({ secret }));
    await expect(tokens().verifyAccess(session.accessToken)).resolves.toMatchObject({ id: 9 });
  });

  it("rejects a bad code", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 9, twoFactorEnabled: true, twoFactorSecret: secret }));
    const temp = await tokens().signTwoFactor(9);
    await expect(auth.completeTwoFactorLogin(temp, "000000")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an access token posing as the temp token", async () => {
    const access = await tokens().signAccess(userRow({ id: 9 }));
    await expect(auth.completeTwoFactorLogin(access, "123456")).rejects.toMatchObject({
      status: 401,
      message: "Invalid 2FA session token.",
    });
    expect(dbMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("register", () => {
  it("makes the very first user an Admin", async () => {
    dbMock.user.count.mockResolvedValue(0);
    dbMock.user.create.mockImplementation((async ({ data }: { data: object }) => userRow({ id: 1, ...data })) as never);
    const user = await auth.register({ name: "Ada", email: "ada@example.com", password: PASSWORD });
    expect(dbMock.user.create.mock.calls[0]![0].data).toMatchObject({ role: "Admin", email: "ada@example.com" });
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("twoFactorSecret");
  });

  it("makes everyone else a Passenger and hashes the password", async () => {
    dbMock.user.count.mockResolvedValue(3);
    dbMock.user.create.mockImplementation((async ({ data }: { data: object }) => userRow({ id: 4, ...data })) as never);
    await auth.register({ name: "Pat", email: "pat@example.com", password: PASSWORD });
    const data = dbMock.user.create.mock.calls[0]![0].data;
    expect(data.role).toBe("Passenger");
    expect(data.password).toMatch(/^\$2[aby]\$10\$/);
  });
});

describe("refreshSession", () => {
  async function tokensFor(id: number) {
    const user = userRow({ id });
    return { access: await tokens().signAccess(user), refresh: await tokens().signRefresh(id) };
  }

  it("rotates: revokes the old refresh token and returns a new pair", async () => {
    const { access, refresh } = await tokensFor(3);
    dbMock.revokedToken.count.mockResolvedValue(0);
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 3 }));

    const session = await auth.refreshSession(refresh, access);

    expect(session.refreshToken).not.toBe(refresh);
    const oldJti = (await tokens().verifyRefresh(refresh)).jti;
    expect(dbMock.revokedToken.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { jti: oldJti } }));
  });

  it("rejects a refresh token that was already used", async () => {
    const { access, refresh } = await tokensFor(3);
    dbMock.revokedToken.count.mockResolvedValue(1);
    await expect(auth.refreshSession(refresh, access)).rejects.toMatchObject({ status: 401 });
  });

  it("requires the caller's access token for the same user (CSRF defence)", async () => {
    const { refresh } = await tokensFor(3);
    const { access: otherAccess } = await tokensFor(4);
    dbMock.revokedToken.count.mockResolvedValue(0);
    await expect(auth.refreshSession(refresh, undefined)).rejects.toMatchObject({ status: 401 });
    await expect(auth.refreshSession(refresh, otherAccess)).rejects.toMatchObject({ status: 403, message: "Token mismatch" });
  });

  it("refuses disabled users and tokens issued before invalidation", async () => {
    const { access, refresh } = await tokensFor(3);
    dbMock.revokedToken.count.mockResolvedValue(0);
    dbMock.user.findUnique.mockResolvedValueOnce(userRow({ id: 3, disabled: true }));
    await expect(auth.refreshSession(refresh, access)).rejects.toMatchObject({ status: 403 });

    dbMock.user.findUnique.mockResolvedValueOnce(userRow({ id: 3, tokensValidFrom: new Date(Date.now() + 5_000) }));
    await expect(auth.refreshSession(refresh, access)).rejects.toMatchObject({ status: 401 });
  });
});

describe("password reset", () => {
  it("emails a link bound to the current password hash", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 2, password: "$2b$10$current" }));
    const message = await auth.requestPasswordReset("ada@example.com");
    expect(message).toMatch(/If an account with that email exists/);
    const mail = vi.mocked(sendMail).mock.calls.at(-1)![0];
    expect(mail.to).toBe("ada@example.com");
    expect(mail.text).toContain("http://localhost:3000/forgot-password?id=2&token=");
  });

  it("gives the same answer for unknown emails and sends nothing", async () => {
    vi.mocked(sendMail).mockClear();
    dbMock.user.findUnique.mockResolvedValue(null);
    expect(await auth.requestPasswordReset("nobody@example.com")).toMatch(/If an account with that email exists/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("resets the password and logs out other sessions", async () => {
    const current = userRow({ id: 2, password: "$2b$10$current" });
    dbMock.user.findUnique.mockResolvedValue(current);
    const token = await tokens().signReset({ id: 2, email: current.email, password: current.password! });

    await auth.resetPassword(2, token, "new-password");

    const { data } = dbMock.user.update.mock.calls[0]![0];
    expect(data.password).toMatch(/^\$2[aby]\$/);
    expect(data.tokensValidFrom).toBeInstanceOf(Date);
  });

  it("rejects a reset token once the password has changed", async () => {
    const token = await tokens().signReset({ id: 2, email: "ada@example.com", password: "$2b$10$old" });
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 2, password: "$2b$10$changed" }));
    await expect(auth.resetPassword(2, token, "new-password")).rejects.toMatchObject({ status: 400 });
    expect(dbMock.user.update).not.toHaveBeenCalled();
  });
});

describe("updateProfile", () => {
  it("normalises the phone number", async () => {
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
    await auth.updateProfile(4, { phoneNumber: "0712 345 678" });
    expect(dbMock.user.updateMany).toHaveBeenCalledWith({ where: { id: 4 }, data: { phoneNumber: "+254712345678" } });
  });

  it("clears the phone number with null", async () => {
    dbMock.user.updateMany.mockResolvedValue({ count: 1 });
    await auth.updateProfile(4, { phoneNumber: null });
    expect(dbMock.user.updateMany.mock.calls[0]![0].data).toEqual({ phoneNumber: null });
  });
});

describe("loginWithGoogle", () => {
  it("links an existing email account to the Google identity", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ id: 6, email: "ada@example.com" }));
    dbMock.user.update.mockResolvedValue(userRow({ id: 6, googleId: "g-1" }));
    await auth.loginWithGoogle({ sub: "g-1", email: "Ada@Example.com", name: "Ada", picture: "https://x/p.png" });
    expect(dbMock.user.update).toHaveBeenCalledWith({
      where: { id: 6 },
      data: { googleId: "g-1", profilePictureUrl: "https://x/p.png" },
    });
  });

  it("creates a Passenger for a new Google user", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.user.create.mockResolvedValue(userRow({ id: 7, googleId: "g-2" }));
    await auth.loginWithGoogle({ sub: "g-2", email: "new@example.com", name: "New" });
    expect(dbMock.user.create.mock.calls[0]![0].data).toMatchObject({ role: "Passenger", email: "new@example.com" });
  });

  it("refuses disabled accounts", async () => {
    dbMock.user.findUnique.mockResolvedValue(userRow({ googleId: "g-1", disabled: true }));
    await expect(auth.loginWithGoogle({ sub: "g-1", email: "ada@example.com", name: "Ada" })).rejects.toMatchObject({
      status: 403,
    });
  });
});
