import { formatDateLong, formatMoney, formatPhone } from '@cs/shared/format';
import type { Lang } from '@cs/shared/i18n';
import { escapeHtml } from '../../bot/texts';
import type { OrderNotification } from '../types';

export const esc = escapeHtml;

export const dateTime = (when: { date: string; time: string }, lang: Lang): string =>
  `${formatDateLong(when.date, lang)}, ${when.time}`;

/** "Bronplyonka: kapot, old bamper; Keramika: bagaj qopqog‘i": zones grouped by kind of work. */
export function itemsLine(order: OrderNotification, lang: Lang): string {
  const groups = new Map<string, string[]>();
  for (const item of order.items) {
    const type = lang === 'ru' ? item.typeNameRu : item.typeNameUz;
    const name = lang === 'ru' ? item.nameRu : item.nameUz;
    groups.set(type, [...(groups.get(type) ?? []), name]);
  }
  return [...groups].map(([type, names]) => `${esc(type)}: ${esc(names.join(', '))}`).join('; ');
}

export const totalLine = (order: OrderNotification, lang: Lang): string =>
  formatMoney(order.total, lang);

export const phoneLine = (phone: string | null): string => (phone ? esc(formatPhone(phone)) : '');
