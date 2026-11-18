/**
 * Phone numbers. A typed number is contact data only; it links accounts only when Telegram has
 * verified it (docs/PLAN.md, section 7.2). The clients validate with the same rule as the server.
 */

/**
 * Normalizes what people type or what Telegram shares:
 * "90 123 45 67", "998901234567", "+998 (90) 123-45-67" → "+998901234567".
 * Foreign numbers stay valid when written with a country code ("+79161234567"), since some
 * clients use them. Returns null when the input cannot be a phone number.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s()-]/g, '');
  if (/^\d{9}$/.test(compact)) return `+998${compact}`;
  if (/^998\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+998\d{9}$/.test(compact)) return compact;
  if (/^\+998/.test(compact)) return null;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  return null;
}

/** "+998901234567" → "+998 90 123 45 67"; other numbers are shown as they are. */
export function formatPhone(phone: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return match ? `+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : phone;
}
