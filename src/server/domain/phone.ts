/**
 * Normalises a phone number for SMS delivery.
 *  - strips spaces, dashes and brackets
 *  - local Kenyan numbers (07…, 01…) become +254…
 *  - 254… without a plus gets one
 * Returns null for an empty value (clears the number).
 */
export function normalizePhoneNumber(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  if (!compact) return null;
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("0")) return `+254${compact.slice(1)}`;
  if (compact.startsWith("254")) return `+${compact}`;
  return compact;
}

/** Loose E.164 check: + followed by 8–15 digits. */
export const isE164 = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);
