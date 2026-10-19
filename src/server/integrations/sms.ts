import "server-only";
import { env } from "@/server/env";

/**
 * Africa's Talking SMS over its REST API (replaces the untyped `africastalking` SDK).
 * Docs: https://developers.africastalking.com/docs/sms/sending
 */

export type SmsResult =
  | { status: "sent"; statusCode: number; raw: unknown }
  | { status: "failed"; statusCode?: number; raw: unknown }
  | { status: "skipped" };

/** Africa's Talking per-recipient status code for "Success". */
export const AT_SUCCESS = 101;

export function smsEndpoint(username: string) {
  return username === "sandbox"
    ? "https://api.sandbox.africastalking.com/version1/messaging"
    : "https://api.africastalking.com/version1/messaging";
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const { AFRICAS_TALKING_API_KEY: apiKey, AFRICAS_TALKING_USERNAME: username } = env();
  if (!apiKey || !username) {
    console.info("[sms] Africa's Talking not configured — skipping SMS.");
    return { status: "skipped" };
  }

  const res = await fetch(smsEndpoint(username), {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ username, to, message }),
    signal: AbortSignal.timeout(10_000),
  });

  const raw = (await res.json().catch(() => null)) as {
    SMSMessageData?: { Recipients?: { statusCode?: number }[] };
  } | null;
  const statusCode = raw?.SMSMessageData?.Recipients?.[0]?.statusCode;

  if (res.ok && statusCode === AT_SUCCESS) return { status: "sent", statusCode, raw };
  return { status: "failed", statusCode, raw };
}
