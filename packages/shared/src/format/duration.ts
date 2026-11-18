import type { Lang } from '../i18n';
import { NBSP } from './money';

const UNITS: Record<Lang, { hour: string; minute: string }> = {
  uz: { hour: 's', minute: 'd' },
  ru: { hour: 'ч', minute: 'мин' },
};

/**
 * Working time as the price list shows it: 81 → "1 s 21 d" (uz) or "1 ч 21 мин" (ru), 54 → "54 d",
 * 120 → "2 s". The units never wrap away from their number.
 */
export function formatDuration(totalMinutes: number, lang: Lang): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const unit = UNITS[lang];
  if (hours === 0) return `${rest}${NBSP}${unit.minute}`;
  if (rest === 0) return `${hours}${NBSP}${unit.hour}`;
  return `${hours}${NBSP}${unit.hour}${NBSP}${rest}${NBSP}${unit.minute}`;
}
