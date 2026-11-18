import type { Notification, RenderedMessage, WorkNotification } from '../types';
import { dateTime, esc, itemsLine, phoneLine, totalLine } from './shared';

/** Texts in Uzbek. Visible text uses ‘ (U+2018) for o‘ and g‘. */
export function renderUz(notification: Exclude<Notification, WorkNotification>): RenderedMessage {
  const lang = 'uz';
  if (notification.type === 'staff.deletion_requested') {
    return {
      text: `<b>Ma’lumotni o‘chirish so‘rovi</b>\n\n${esc(notification.clientName)} shaxsiy ma’lumotlarini o‘chirishni so‘radi. Panelda mijoz kartasini oching.`,
      button: { text: 'Panelda ochish', target: 'panel', orderId: null },
    };
  }
  const number = `№${notification.number}`;
  const car = `${esc(notification.car)} (${esc(notification.plate)})`;
  const when = esc(dateTime(notification.startsAt, lang));
  const body = `${car}\n${itemsLine(notification, lang)}\n${when}`;
  const money = notification.hasUnpriced
    ? `Dastlabki summa: ${esc(totalLine(notification, lang))} (kelishiladigan ishlar kirmagan)`
    : `Summa: ${esc(totalLine(notification, lang))}`;
  const open = (text: string) =>
    ({ text, target: 'order', orderId: notification.orderId }) as const;
  const panel = { text: 'Panelda ochish', target: 'panel', orderId: notification.orderId } as const;

  switch (notification.type) {
    case 'order.created':
      return {
        text: `<b>Arizangiz qabul qilindi, ${number}</b>\n\n${body}\n${money}\n\nAdministrator tez orada qo‘ng‘iroq qilib, vaqtni tasdiqlaydi.`,
        button: open('Arizani ochish'),
      };
    case 'order.cancelled': {
      const reason = notification.reason ? `\nSabab: ${esc(notification.reason.uz)}` : '';
      const call = notification.workshopPhone
        ? `\n\nSavollar bo‘lsa, qo‘ng‘iroq qiling: ${phoneLine(notification.workshopPhone)}`
        : '';
      return {
        text: `<b>Ariza bekor qilindi, ${number}</b>\n\n${body}${reason}${call}`,
        button: null,
      };
    }
    case 'staff.order_new':
      return {
        text: `<b>Yangi ariza ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n${money}\n\nMijozga qo‘ng‘iroq qiling.`,
        button: panel,
      };
    case 'staff.client_cancelled': {
      const reason = notification.reason ? `\nSabab: ${esc(notification.reason.uz)}` : '';
      const note = notification.note ? `\n«${esc(notification.note)}»` : '';
      return {
        text: `<b>Mijoz arizani bekor qildi, ${number}</b>\n\n${esc(notification.clientName)}\n${body}${reason}${note}`,
        button: panel,
      };
    }
    case 'staff.reschedule_requested':
      return {
        text: `<b>Mijoz vaqtni ko‘chirishni so‘radi, ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n\nMijozga qo‘ng‘iroq qilib, yangi vaqtni kelishing.`,
        button: panel,
      };

    case 'order.confirmed':
      return {
        text: `<b>Arizangiz tasdiqlandi, ${number}</b>\n\n${body}\n${money}\n\nKelishingizni kutamiz.`,
        button: open('Arizani ochish'),
      };
    case 'order.reminder':
      return {
        text: `<b>Eslatma: ${notification.hoursBefore} soatdan keyin tashrif, ${number}</b>\n\n${body}`,
        button: open('Arizani ochish'),
      };
    case 'order.rescheduled':
      return {
        text: `<b>Vaqt o‘zgartirildi, ${number}</b>\n\n${car}\n${itemsLine(notification, lang)}\nYangi vaqt: ${when}\nAvvalgi vaqt: ${esc(dateTime(notification.previousStartsAt, lang))}`,
        button: open('Arizani ochish'),
      };
    case 'staff.order_unanswered':
      return {
        text: `<b>Qo‘ng‘iroqsiz ariza ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n\nAriza ${notification.waitingMin} ish daqiqasidan beri javobsiz.`,
        button: panel,
      };
  }
}
