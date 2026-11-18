import type { Lang } from '../i18n';

/**
 * Dates reach the clients as plain local strings ("2026-10-29") that the server has already
 * computed in Asia/Tashkent. They are read as UTC here on purpose: the phone's own time zone
 * must not change what is shown.
 */

const MONTHS: Record<Lang, readonly string[]> = {
  uz: [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr',
  ],
  ru: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
};

/** Monday first, as the week starts in Uzbekistan. */
const WEEKDAYS: Record<Lang, readonly string[]> = {
  uz: ['dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba', 'yakshanba'],
  ru: ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'],
};

const WEEKDAYS_SHORT: Record<Lang, readonly string[]> = {
  uz: ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
};

interface DateParts {
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  day: number;
  /** 1–12. */
  month: number;
}

function partsOf(date: string): DateParts {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { weekday: utcDay === 0 ? 7 : utcDay, day, month };
}

/** "2026-10-29" → "29-oktabr, payshanba" (uz) or "29 октября, четверг" (ru). */
export function formatDateLong(date: string, lang: Lang): string {
  const { weekday, day, month } = partsOf(date);
  const monthName = MONTHS[lang][month - 1];
  const weekdayName = WEEKDAYS[lang][weekday - 1];
  return lang === 'uz'
    ? `${day}-${monthName}, ${weekdayName}`
    : `${day} ${monthName}, ${weekdayName}`;
}

/** 1 → "Du" (uz) or "Пн" (ru): column headers of a calendar. */
export function weekdayShort(weekday: number, lang: Lang): string {
  return WEEKDAYS_SHORT[lang][weekday - 1] ?? '';
}
