import type { Dictionary, Lang } from '@cs/shared/i18n';

/**
 * Texts of the bot. Every text is HTML (bot.ts sets parse_mode), so a value inserted into one must
 * go through `escapeHtml`. Visible text uses ‘ (U+2018) for o‘ and g‘.
 */

const uz = {
  welcome: (name: string) =>
    `Assalomu alaykum, ${name}!\n\nIlovada xizmat narxlarini ko‘rasiz, mashinangizni bron qilasiz va ish qachon tayyor bo‘lishini kuzatasiz.`,
  appNotReady: 'Ilova hali sozlanmagan. Birozdan so‘ng qayta urinib ko‘ring.',
  fallback: 'Bron, buyurtmalar va profil ilovada.',
  openApp: 'Ilovani ochish',
  errorGeneric: 'Xatolik yuz berdi. Birozdan so‘ng qayta urinib ko‘ring.',
  actConfirmed: 'Dalolatnoma tasdiqlandi. Rahmat!',
  extraApproved: 'Qo‘shimcha ishga rozilik qabul qilindi.',
  extraRejected: 'Qo‘shimcha ish bajarilmaydi.',
  alreadyAnswered: 'Javob allaqachon qabul qilingan.',
  notAvailable: 'Bu amal endi mumkin emas. Arizani ilovada oching.',
  notFound: 'Topilmadi. Arizani ilovada oching.',
  loginCode: (code: string) =>
    `Panelga kirish kodi: <b>${code}</b>\n\nKod 5 daqiqa amal qiladi. Siz kirmayotgan bo‘lsangiz, kodni hech kimga bermang va egasiga xabar bering.`,
};

const ru: Dictionary<typeof uz> = {
  welcome: (name) =>
    `Здравствуйте, ${name}!\n\nВ приложении можно узнать цены на услуги, записать машину и следить, когда она будет готова.`,
  appNotReady: 'Приложение ещё не настроено. Попробуйте чуть позже.',
  fallback: 'Запись, заказы и профиль — в приложении.',
  openApp: 'Открыть приложение',
  errorGeneric: 'Произошла ошибка. Попробуйте чуть позже.',
  actConfirmed: 'Акт подтверждён. Спасибо!',
  extraApproved: 'Согласие на дополнительную работу принято.',
  extraRejected: 'Дополнительная работа выполняться не будет.',
  alreadyAnswered: 'Ответ уже принят.',
  notAvailable: 'Это действие уже недоступно. Откройте заявку в приложении.',
  notFound: 'Не найдено. Откройте заявку в приложении.',
  loginCode: (code) =>
    `Код входа в панель: <b>${code}</b>\n\nКод действует 5 минут. Если входите не вы, никому не сообщайте код и предупредите владельца.`,
};

export type BotTexts = Dictionary<typeof uz>;

export const texts: Readonly<Record<Lang, BotTexts>> = { uz, ru };

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>]/g, (char) => HTML_ESCAPES[char] ?? char);
