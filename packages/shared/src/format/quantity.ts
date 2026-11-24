import type { Lang } from '../i18n';
import type { ProductUnit } from '../vocabulary/stock';
import { formatAmount, NBSP } from './money';

/** Units as people write them next to a number. */
export const UNIT_LABELS: Readonly<Record<Lang, Readonly<Record<ProductUnit, string>>>> = {
  uz: { pcs: 'dona', ml: 'ml', l: 'l', kg: 'kg', m: 'm', m2: 'm²' },
  ru: { pcs: 'шт.', ml: 'мл', l: 'л', kg: 'кг', m: 'м', m2: 'м²' },
};

/**
 * 1234.5 → "1 234,5" (a comma for the decimals, as both languages write them). Up to three
 * decimals, trailing zeros dropped: a stock of 12.300 m² reads "12,3".
 */
export function formatQtyNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  const whole = Math.trunc(rounded);
  const fraction = Math.abs(Math.round((rounded - whole) * 1000));
  const sign = rounded < 0 && whole === 0 ? '−' : '';
  const head = `${sign}${formatAmount(whole)}`;
  if (fraction === 0) return head;
  return `${head},${String(fraction).padStart(3, '0').replace(/0+$/, '')}`;
}

/** 12.3 and m2 → "12,3 m²"; 42 and pcs → "42 dona". */
export const formatQty = (value: number, unit: ProductUnit, lang: Lang): string =>
  `${formatQtyNumber(value)}${NBSP}${UNIT_LABELS[lang][unit]}`;

/**
 * What a person typed into a quantity field: digits with a comma or a dot. Null when it is not a
 * number with at most three decimals.
 */
export function parseQty(text: string): number | null {
  const cleaned = text.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return null;
  return Number(cleaned);
}
