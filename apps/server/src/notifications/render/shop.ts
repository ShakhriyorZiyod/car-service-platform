import { formatMoney } from '@cs/shared/format';
import type { Lang } from '@cs/shared/i18n';
import type { RenderedMessage, ShopNotification } from '../types';
import { dateTime, esc, phoneLine } from './shared';

/** The shop's messages (docs/PLAN.md, section 12; stage 9), in both languages. Pure. */

const itemsOf = (notification: ShopNotification, lang: Lang): string =>
  notification.items
    .map((item) => `• ${esc(lang === 'ru' ? item.nameRu : item.nameUz)} × ${item.qty}`)
    .join('\n');

export function renderShop(notification: ShopNotification, lang: Lang): RenderedMessage {
  const ru = lang === 'ru';
  const number = `№${notification.number}`;
  const total = esc(formatMoney(notification.total, lang));
  const body = `${itemsOf(notification, lang)}\n${ru ? 'Сумма' : 'Summa'}: ${total}`;
  const open = {
    text: ru ? 'Открыть заказ' : 'Buyurtmani ochish',
    target: 'shop_order' as const,
    orderId: null,
    shopOrderId: notification.shopOrderId,
  };
  const panel = {
    text: ru ? 'Открыть в панели' : 'Panelda ochish',
    target: 'panel' as const,
    orderId: null,
    path: `shop?order=${notification.shopOrderId}`,
  };

  switch (notification.type) {
    case 'shop.created':
      return {
        text: ru
          ? `<b>Заказ ${number} принят</b>\n\n${body}\n\nАдминистратор позвонит и подтвердит заказ. Товар отложен для вас.`
          : `<b>Buyurtma ${number} qabul qilindi</b>\n\n${body}\n\nAdministrator qo‘ng‘iroq qilib buyurtmani tasdiqlaydi. Tovar siz uchun ajratib qo‘yildi.`,
        button: open,
      };
    case 'shop.confirmed':
      return {
        text: ru
          ? `<b>Заказ ${number} подтверждён</b>\n\nМы соберём его и сообщим, когда можно забрать.`
          : `<b>Buyurtma ${number} tasdiqlandi</b>\n\nYig‘ib bo‘lgach, olib ketish mumkinligini xabar qilamiz.`,
        button: open,
      };
    case 'shop.ready': {
      const until = esc(dateTime(notification.pickupUntil, lang));
      const where = notification.address ? `\n${esc(notification.address)}` : '';
      return {
        text: ru
          ? `<b>Заказ ${number} собран</b>\n\n${body}\n\nМожно забрать до ${until}.${where}\nОплата при получении.`
          : `<b>Buyurtma ${number} yig‘ildi</b>\n\n${body}\n\n${until} gacha olib ketishingiz mumkin.${where}\nTo‘lov olib ketayotganda.`,
        button: open,
      };
    }
    case 'shop.cancelled': {
      const reason = notification.reason
        ? `\n${ru ? 'Причина' : 'Sabab'}: ${esc(ru ? notification.reason.ru : notification.reason.uz)}`
        : '';
      const call = notification.workshopPhone
        ? ru
          ? `\n\nЕсли есть вопросы, позвоните: ${phoneLine(notification.workshopPhone)}`
          : `\n\nSavollar bo‘lsa, qo‘ng‘iroq qiling: ${phoneLine(notification.workshopPhone)}`
        : '';
      return {
        text: ru
          ? `<b>Заказ ${number} отменён</b>\n\n${body}${reason}${call}`
          : `<b>Buyurtma ${number} bekor qilindi</b>\n\n${body}${reason}${call}`,
        button: null,
      };
    }
    case 'shop.completed':
      return {
        text: ru
          ? `<b>Заказ ${number} выдан</b>\n\nСпасибо за покупку!`
          : `<b>Buyurtma ${number} topshirildi</b>\n\nXaridingiz uchun rahmat!`,
        button: open,
      };
    case 'staff.shop_order_new':
      return {
        text: ru
          ? `<b>Новый заказ магазина ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n\nПозвоните клиенту.`
          : `<b>Yangi do‘kon buyurtmasi ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n\nMijozga qo‘ng‘iroq qiling.`,
        button: panel,
      };
    case 'staff.shop_client_cancelled': {
      const reason = notification.reason
        ? `\n${ru ? 'Причина' : 'Sabab'}: ${esc(ru ? notification.reason.ru : notification.reason.uz)}`
        : '';
      return {
        text: ru
          ? `<b>Клиент отменил заказ ${number}</b>\n\n${esc(notification.clientName)}\n${body}${reason}\n\nРезерв снят.`
          : `<b>Mijoz buyurtmani bekor qildi, ${number}</b>\n\n${esc(notification.clientName)}\n${body}${reason}\n\nRezerv yechildi.`,
        button: panel,
      };
    }
  }
}
