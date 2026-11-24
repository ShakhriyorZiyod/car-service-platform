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

/** What a phone field starts with: the Uzbek code, so only the nine digits are typed. */
export const PHONE_PREFIX = '+998 ';
const UZ_LOCAL_DIGITS = 9;
/** E.164: at most 15 digits with the country code. */
const MAX_DIGITS = 15;

/**
 * What a phone field shows while a person types or pastes (docs/DESIGN.md, section 6): an Uzbek
 * number as "+998 90 123 45 67", the prefix staying put; another country's, started with "+", as
 * "+" and its digits. Whatever is pasted, "998901234567", "90 123 45 67" or
 * "+998 (90) 123-45-67", lands in the same form; an emptied field stays empty. The server stores
 * the result of `normalizePhone`, which reads every one of these forms.
 */
export function formatPhoneInput(typed: string): string {
  // A number pasted after the prefix ("+998 +7 916...") counts from its own "+".
  const plus = typed.lastIndexOf('+');
  const text = plus >= 0 ? typed.slice(plus) : typed;
  const digits = text.replace(/\D/g, '');
  const withPlus = text.startsWith('+');
  // Another country; also "+9" and "+99" on the way to "+998".
  if (withPlus && !digits.startsWith('998')) return `+${digits.slice(0, MAX_DIGITS)}`;
  if (!withPlus && digits === '') return '';

  let local = withPlus ? digits.slice(3) : digits;
  // "998901234567" pasted whole, also after the prefix; nine digits are always the local part
  // ("99 812 34 56" starts with 998 too).
  if (local.length > UZ_LOCAL_DIGITS && local.startsWith('998')) local = local.slice(3);
  local = local.slice(0, UZ_LOCAL_DIGITS);
  const groups = [local.slice(0, 2), local.slice(2, 5), local.slice(5, 7), local.slice(7, 9)];
  const shown = groups.filter((group) => group !== '').join(' ');
  return shown === '' ? PHONE_PREFIX : `${PHONE_PREFIX}${shown}`;
}

/**
 * Where a phone field is: empty (nothing but the prefix), incomplete (the save waits), or a
 * complete number the server will accept.
 */
export function phoneInputState(text: string): 'empty' | 'incomplete' | 'complete' {
  const compact = text.replace(/[\s+]/g, '');
  if (compact === '' || compact === '998') return 'empty';
  return normalizePhone(text) ? 'complete' : 'incomplete';
}
