import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";

export type Mail = { to: string; subject: string; text: string; html?: string };

let transporterPromise: Promise<Transporter | null> | undefined;

async function createTransporter(): Promise<Transporter | null> {
  const e = env();
  if (e.EMAIL_USER && e.EMAIL_PASS) {
    return nodemailer.createTransport({
      host: e.EMAIL_HOST,
      port: e.EMAIL_PORT,
      secure: e.EMAIL_SECURE,
      auth: { user: e.EMAIL_USER, pass: e.EMAIL_PASS },
    });
  }
  if (e.NODE_ENV === "production") {
    console.error("[mail] EMAIL_USER / EMAIL_PASS not set — emails will not be sent.");
    return null;
  }
  // Development fallback: Ethereal catches the mail and logs a preview URL.
  const account = await nodemailer.createTestAccount();
  console.warn("[mail] Using an Ethereal test inbox. Set EMAIL_* variables to send real email.");
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: account.user, pass: account.pass },
  });
}

/** Sends an email. Never throws — failures are logged so callers can't leak account existence. */
export async function sendMail(mail: Mail): Promise<boolean> {
  try {
    transporterPromise ??= createTransporter();
    const transporter = await transporterPromise;
    if (!transporter) return false;
    const e = env();
    const info = await transporter.sendMail({
      from: e.EMAIL_FROM ?? e.EMAIL_USER ?? "MatConnect <no-reply@matconnect.local>",
      ...mail,
    });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.info("[mail] preview:", preview);
    return true;
  } catch (error) {
    console.error("[mail] failed to send", error);
    transporterPromise = undefined;
    return false;
  }
}
