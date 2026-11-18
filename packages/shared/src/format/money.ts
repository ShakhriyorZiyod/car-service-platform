import type { Lang } from '../i18n';

/** Keeps a number and its currency on one line. */
export const NBSP = ' ';

const CURRENCY: Record<Lang, string> = { uz: 'so‘m', ru: 'сум' };

/** 1400000 → "1 400 000" (non-breaking spaces between the groups). */
export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '−' : '';
  const digits = String(Math.trunc(Math.abs(amount))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${digits}`;
}

/** 1400000 → "1 400 000 so‘m" (uz) or "1 400 000 сум" (ru). Money is whole so‘m (TZ 15.6). */
export function formatMoney(amount: number, lang: Lang): string {
  return `${formatAmount(amount)}${NBSP}${CURRENCY[lang]}`;
}
