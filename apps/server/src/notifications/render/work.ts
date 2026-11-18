import { formatAmount, formatDuration, formatMoney } from '@cs/shared/format';
import type { Lang } from '@cs/shared/i18n';
import type { RenderedMessage, WorkNotification } from '../types';
import { esc } from './shared';

/**
 * The messages of the work itself (docs/PLAN.md, section 12): the act, extra work, "ready" and the
 * masters' tasks, in both languages. Visible Uzbek text uses ‘ (U+2018) for o‘ and g‘ and ’ for
 * the apostrophe of ma’lumot.
 */

interface Words {
  open: string;
  panel: string;
  task: string;
  fuel: (level: number) => string;
  km: string;
  actTitle: string;
  actMileage: string;
  actFuel: string;
  actCounts: (defects: number, photos: number) => string;
  actAsk: string;
  actConfirm: string;
  extraTitle: string;
  extraWhat: string;
  extraPrice: string;
  extraAgreed: string;
  extraTotal: string;
  extraAsk: string;
  extraYes: string;
  extraNo: string;
  readyTitle: string;
  readyTotal: string;
  readyUntil: (time: string) => string;
  taskTitle: string;
  taskWorks: string;
  taskNorm: string;
  taskInstruction: string;
  reworkTitle: string;
  reworkRemark: string;
  reportTitle: string;
  reportMaster: string;
  reportAttempt: string;
  decidedTitle: string;
  decided: Record<'approved' | 'rejected', string>;
  via: Record<'tma' | 'bot' | 'phone', string>;
}

const FUEL: Record<Lang, readonly string[]> = {
  uz: ['bo‘sh', '1/4', '1/2', '3/4', 'to‘liq'],
  ru: ['пусто', '1/4', '1/2', '3/4', 'полный'],
};

const WORDS: Record<Lang, Words> = {
  uz: {
    open: 'Arizani ochish',
    panel: 'Panelda ochish',
    task: 'Vazifani ochish',
    fuel: (level) => FUEL.uz[level] ?? String(level),
    km: 'km',
    actTitle: 'Qabul dalolatnomasini tasdiqlang',
    actMileage: 'Probeg',
    actFuel: 'Yoqilg‘i',
    actCounts: (defects, photos) => `Nuqsonlar: ${defects} ta, fotolar: ${photos} ta`,
    actAsk: 'Mashinaning qabul paytidagi holatini ko‘rib chiqing va tasdiqlang.',
    actConfirm: 'Tasdiqlayman',
    extraTitle: 'Qo‘shimcha ish taklifi',
    extraWhat: 'Qo‘shimcha ish',
    extraPrice: 'Narxi',
    extraAgreed: 'kelishiladi',
    extraTotal: 'Yangi jami',
    extraAsk: 'Qo‘shimcha ishga rozimisiz?',
    extraYes: 'Roziman',
    extraNo: 'Kerak emas',
    readyTitle: 'Mashinangiz tayyor',
    readyTotal: 'Summa',
    readyUntil: (time) => `Bugun soat ${time} gacha olib ketishingiz mumkin.`,
    taskTitle: 'Yangi vazifa',
    taskWorks: 'Ishlar',
    taskNorm: 'Me’yor',
    taskInstruction: 'Ko‘rsatma',
    reworkTitle: 'Qayta ishlash kerak',
    reworkRemark: 'Izoh',
    reportTitle: 'Hisobot topshirildi',
    reportMaster: 'Usta',
    reportAttempt: 'Urinish',
    decidedTitle: 'Mijoz qo‘shimcha ishga javob berdi',
    decided: { approved: 'roziman', rejected: 'kerak emas' },
    via: { tma: 'ilovada', bot: 'botda', phone: 'telefon orqali' },
  },
  ru: {
    open: 'Открыть заявку',
    panel: 'Открыть в панели',
    task: 'Открыть задачу',
    fuel: (level) => FUEL.ru[level] ?? String(level),
    km: 'км',
    actTitle: 'Подтвердите акт приёма',
    actMileage: 'Пробег',
    actFuel: 'Топливо',
    actCounts: (defects, photos) => `Дефектов: ${defects}, фото: ${photos}`,
    actAsk: 'Проверьте состояние автомобиля при приёме и подтвердите.',
    actConfirm: 'Подтверждаю',
    extraTitle: 'Предложение дополнительной работы',
    extraWhat: 'Дополнительная работа',
    extraPrice: 'Цена',
    extraAgreed: 'по договорённости',
    extraTotal: 'Новый итог',
    extraAsk: 'Согласны на дополнительную работу?',
    extraYes: 'Согласен',
    extraNo: 'Не нужно',
    readyTitle: 'Ваш автомобиль готов',
    readyTotal: 'Сумма',
    readyUntil: (time) => `Забрать можно сегодня до ${time}.`,
    taskTitle: 'Новая задача',
    taskWorks: 'Работы',
    taskNorm: 'Норма',
    taskInstruction: 'Указание',
    reworkTitle: 'Нужна доработка',
    reworkRemark: 'Комментарий',
    reportTitle: 'Отчёт сдан',
    reportMaster: 'Мастер',
    reportAttempt: 'Попытка',
    decidedTitle: 'Клиент ответил по дополнительной работе',
    decided: { approved: 'согласен', rejected: 'не нужно' },
    via: { tma: 'в приложении', bot: 'в боте', phone: 'по телефону' },
  },
};

/** The text and buttons of a work message in the recipient's language. Pure. */
export function renderWork(notification: WorkNotification, lang: Lang): RenderedMessage {
  const w = WORDS[lang];
  const number = `№${notification.number}`;
  const car = `${esc(notification.car)} (${esc(notification.plate)})`;
  const open = { text: w.open, target: 'order', orderId: notification.orderId } as const;
  const panel = { text: w.panel, target: 'panel', orderId: notification.orderId } as const;
  const named = (item: { uz: string; ru: string }) => esc(lang === 'ru' ? item.ru : item.uz);

  switch (notification.type) {
    case 'act.confirm_request':
      return {
        text: [
          `<b>${w.actTitle}, ${number}</b>`,
          '',
          car,
          `${w.actMileage}: ${formatAmount(notification.mileageKm)} ${w.km}`,
          `${w.actFuel}: ${w.fuel(notification.fuelLevel)}`,
          w.actCounts(notification.defects, notification.photos),
          '',
          w.actAsk,
        ].join('\n'),
        button: open,
        actions: [{ text: w.actConfirm, data: `act:ok:${notification.orderId}` }],
      };
    case 'extra.approval_request': {
      const price =
        notification.price === null ? w.extraAgreed : formatMoney(notification.price, lang);
      return {
        text: [
          `<b>${w.extraTitle}, ${number}</b>`,
          '',
          car,
          `${w.extraWhat}: ${named(notification.itemName)}`,
          `${w.extraPrice}: ${esc(price)}`,
          `${w.extraTotal}: ${esc(formatMoney(notification.newTotal, lang))}`,
          '',
          w.extraAsk,
        ].join('\n'),
        button: open,
        actions: [
          { text: w.extraYes, data: `extra:yes:${notification.itemId}` },
          { text: w.extraNo, data: `extra:no:${notification.itemId}` },
        ],
      };
    }
    case 'order.ready': {
      const until = notification.closesAt ? `\n${w.readyUntil(notification.closesAt)}` : '';
      return {
        text: `<b>${w.readyTitle}, ${number}</b>\n\n${car}\n${w.readyTotal}: ${esc(formatMoney(notification.total, lang))}${until}`,
        button: open,
      };
    }
    case 'staff.task_assigned': {
      const instruction = notification.instruction
        ? `\n${w.taskInstruction}: ${esc(notification.instruction)}`
        : '';
      return {
        text: `<b>${w.taskTitle}, ${number}</b>\n\n${car}\n${w.taskWorks}: ${notification.items.map(named).join(', ')}\n${w.taskNorm}: ${formatDuration(notification.normMinutes, lang)}${instruction}`,
        button: {
          text: w.task,
          target: 'task',
          orderId: notification.orderId,
          taskId: notification.taskId,
        },
      };
    }
    case 'staff.task_rework':
      return {
        text: `<b>${w.reworkTitle}, ${number}</b>\n\n${car}\n${w.reworkRemark}: ${esc(notification.remark)}`,
        button: {
          text: w.task,
          target: 'task',
          orderId: notification.orderId,
          taskId: notification.taskId,
        },
      };
    case 'staff.report_submitted':
      return {
        text: `<b>${w.reportTitle}, ${number}</b>\n\n${car}\n${w.reportMaster}: ${esc(notification.masterName)}\n${w.reportAttempt}: ${notification.attempt}`,
        button: panel,
      };
    case 'staff.extra_decided':
      return {
        text: `<b>${w.decidedTitle}, ${number}</b>\n\n${car}\n${named(notification.itemName)}: ${w.decided[notification.decision]} (${w.via[notification.via]})`,
        button: panel,
      };
  }
}
