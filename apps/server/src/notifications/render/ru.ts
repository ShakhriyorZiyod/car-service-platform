import { formatQty } from '@cs/shared/format';
import type { Notification, RenderedMessage, ShopNotification, WorkNotification } from '../types';
import { dateTime, esc, itemsLine, phoneLine, totalLine } from './shared';

/** Texts in Russian. */
export function renderRu(
  notification: Exclude<Notification, WorkNotification | ShopNotification>,
): RenderedMessage {
  const lang = 'ru';
  if (notification.type === 'staff.stock_low') {
    const lines = notification.items.map(
      (item) =>
        `• ${esc(item.nameRu)}: ${esc(formatQty(item.free, item.unit, lang))} (минимум ${esc(formatQty(item.minQty, item.unit, lang))})`,
    );
    if (notification.more > 0) lines.push(`…и ещё ${notification.more}`);
    return {
      text: `<b>На складе мало</b>\n\n${lines.join('\n')}`,
      button: {
        text: 'Открыть в панели',
        target: 'panel',
        orderId: null,
        path: 'stock?filter=low',
      },
    };
  }
  if (notification.type === 'staff.deletion_requested') {
    return {
      text: `<b>Запрос на удаление данных</b>\n\n${esc(notification.clientName)} просит удалить персональные данные. Откройте карточку клиента в панели.`,
      button: { text: 'Открыть в панели', target: 'panel', orderId: null },
    };
  }
  const number = `№${notification.number}`;
  const car = `${esc(notification.car)} (${esc(notification.plate)})`;
  const when = esc(dateTime(notification.startsAt, lang));
  const body = `${car}\n${itemsLine(notification, lang)}\n${when}`;
  const money = notification.hasUnpriced
    ? `Предварительная сумма: ${esc(totalLine(notification, lang))} (без работ по договорённости)`
    : `Сумма: ${esc(totalLine(notification, lang))}`;
  const open = (text: string) =>
    ({ text, target: 'order', orderId: notification.orderId }) as const;
  const panel = {
    text: 'Открыть в панели',
    target: 'panel',
    orderId: notification.orderId,
  } as const;

  switch (notification.type) {
    case 'order.created':
      return {
        text: `<b>Заявка принята, ${number}</b>\n\n${body}\n${money}\n\nАдминистратор скоро позвонит и подтвердит время.`,
        button: open('Открыть заявку'),
      };
    case 'order.cancelled': {
      const reason = notification.reason ? `\nПричина: ${esc(notification.reason.ru)}` : '';
      const call = notification.workshopPhone
        ? `\n\nЕсли есть вопросы, позвоните: ${phoneLine(notification.workshopPhone)}`
        : '';
      return {
        text: `<b>Заявка отменена, ${number}</b>\n\n${body}${reason}${call}`,
        button: null,
      };
    }
    case 'staff.order_new':
      return {
        text: `<b>Новая заявка ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n${money}\n\nПозвоните клиенту.`,
        button: panel,
      };
    case 'staff.client_cancelled': {
      const reason = notification.reason ? `\nПричина: ${esc(notification.reason.ru)}` : '';
      const note = notification.note ? `\n«${esc(notification.note)}»` : '';
      return {
        text: `<b>Клиент отменил заявку, ${number}</b>\n\n${esc(notification.clientName)}\n${body}${reason}${note}`,
        button: panel,
      };
    }
    case 'staff.reschedule_requested':
      return {
        text: `<b>Клиент просит перенести время, ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n\nПозвоните клиенту и согласуйте новое время.`,
        button: panel,
      };

    case 'order.confirmed':
      return {
        text: `<b>Заявка подтверждена, ${number}</b>\n\n${body}\n${money}\n\nЖдём вас.`,
        button: open('Открыть заявку'),
      };
    case 'order.reminder':
      return {
        text: `<b>Напоминание: визит через ${notification.hoursBefore} ч, ${number}</b>\n\n${body}`,
        button: open('Открыть заявку'),
      };
    case 'order.rescheduled':
      return {
        text: `<b>Время изменено, ${number}</b>\n\n${car}\n${itemsLine(notification, lang)}\nНовое время: ${when}\nПрежнее время: ${esc(dateTime(notification.previousStartsAt, lang))}`,
        button: open('Открыть заявку'),
      };
    case 'staff.order_unanswered':
      return {
        text: `<b>Заявка без звонка ${number}</b>\n\n${esc(notification.clientName)}\n${body}\n\nЗаявка без ответа уже ${notification.waitingMin} рабочих мин.`,
        button: panel,
      };
  }
}
