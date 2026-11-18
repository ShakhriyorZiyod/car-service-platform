import type { Lang } from '@cs/shared/i18n';
import type { Notification, RenderedMessage, WorkNotification } from '../types';
import { renderRu } from './ru';
import { renderUz } from './uz';
import { renderWork } from './work';

const isWork = (notification: Notification): notification is WorkNotification =>
  [
    'act.confirm_request',
    'extra.approval_request',
    'order.ready',
    'staff.task_assigned',
    'staff.task_rework',
    'staff.report_submitted',
    'staff.extra_decided',
  ].includes(notification.type);

/** The text and button of a message in the recipient's language. Pure. */
export function renderNotification(notification: Notification, lang: Lang): RenderedMessage {
  if (isWork(notification)) return renderWork(notification, lang);
  return lang === 'ru' ? renderRu(notification) : renderUz(notification);
}
