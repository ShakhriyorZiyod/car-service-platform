import { LANGS } from '@cs/shared/i18n';
import { z } from 'zod';

/**
 * The messages the system sends to people (docs/PLAN.md, sections 4.8 and 12). Each carries
 * everything its text needs as it was when the change happened, so rendering is a pure function
 * and a later edit of the order does not rewrite what was said.
 */

const when = z.object({ date: z.string(), time: z.string() });
const bilingual = z.object({ uz: z.string(), ru: z.string() });

/** What every message about an order says of it. */
const orderFacts = z.object({
  orderId: z.uuid(),
  number: z.number().int(),
  car: z.string(),
  plate: z.string(),
  startsAt: when,
  items: z.array(
    z.object({
      nameUz: z.string(),
      nameRu: z.string(),
      typeNameUz: z.string(),
      typeNameRu: z.string(),
    }),
  ),
  total: z.number().int(),
  /** Some zones have no price yet ("to be agreed"), so the total is not final. */
  hasUnpriced: z.boolean(),
});

/** What the messages of the work itself say of an order: who it is about and nothing more. */
const orderRef = z.object({
  orderId: z.uuid(),
  number: z.number().int(),
  car: z.string(),
  plate: z.string(),
});

export const notificationSchema = z.discriminatedUnion('type', [
  /** To the client: their request was received. */
  orderFacts.extend({ type: z.literal('order.created') }),
  /** To the client: the workshop (or the system) cancelled the request. */
  orderFacts.extend({
    type: z.literal('order.cancelled'),
    reason: bilingual.nullable(),
    workshopPhone: z.string().nullable(),
  }),
  /** To the admins: a new request waits for a call. */
  orderFacts.extend({ type: z.literal('staff.order_new'), clientName: z.string() }),
  orderFacts.extend({
    type: z.literal('staff.client_cancelled'),
    clientName: z.string(),
    reason: bilingual.nullable(),
    note: z.string().nullable(),
  }),
  orderFacts.extend({ type: z.literal('staff.reschedule_requested'), clientName: z.string() }),
  /** To the client: the workshop confirmed the time. */
  orderFacts.extend({ type: z.literal('order.confirmed') }),
  /** To the client: the visit is coming up. */
  orderFacts.extend({ type: z.literal('order.reminder'), hoursBefore: z.number().int() }),
  /** To the client: the workshop moved the time. */
  orderFacts.extend({ type: z.literal('order.rescheduled'), previousStartsAt: when }),
  /** To the director and the owner: nobody has called this request. */
  orderFacts.extend({
    type: z.literal('staff.order_unanswered'),
    clientName: z.string(),
    waitingMin: z.number().int(),
  }),
  // Stage 5: reception, extra work and the masters' tasks
  /** To the client: the act of taking the car in waits for their word. */
  orderRef.extend({
    type: z.literal('act.confirm_request'),
    mileageKm: z.number().int(),
    /** In quarters of a tank: 0 empty … 4 full. */
    fuelLevel: z.number().int(),
    defects: z.number().int(),
    photos: z.number().int(),
  }),
  /** To the client: extra work was found; it is done only if they agree. */
  orderRef.extend({
    type: z.literal('extra.approval_request'),
    itemId: z.uuid(),
    itemName: bilingual,
    /** Null: the price is agreed. */
    price: z.number().int().nullable(),
    newTotal: z.number().int(),
  }),
  /** To the client: the car is ready. */
  orderRef.extend({
    type: z.literal('order.ready'),
    total: z.number().int(),
    /** When the workshop closes today, if it is open. */
    closesAt: z.string().nullable(),
  }),
  /** To the master: a task was given to them. */
  orderRef.extend({
    type: z.literal('staff.task_assigned'),
    taskId: z.uuid(),
    items: z.array(bilingual),
    normMinutes: z.number().int(),
    instruction: z.string(),
  }),
  /** To the master: the report was sent back. */
  orderRef.extend({
    type: z.literal('staff.task_rework'),
    taskId: z.uuid(),
    remark: z.string(),
  }),
  /** To the admins: a master handed in a report. */
  orderRef.extend({
    type: z.literal('staff.report_submitted'),
    taskId: z.uuid(),
    masterName: z.string(),
    attempt: z.number().int(),
  }),
  /** To the admins: the client (or the admin by phone) answered about extra work. */
  orderRef.extend({
    type: z.literal('staff.extra_decided'),
    itemName: bilingual,
    decision: z.enum(['approved', 'rejected']),
    via: z.enum(['tma', 'bot', 'phone']),
  }),
  /** To the owner: a client asked for their data to be erased (TZ 15.3). */
  z.object({
    type: z.literal('staff.deletion_requested'),
    clientId: z.uuid(),
    clientName: z.string(),
  }),
]);

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationType = Notification['type'];
/** The messages of the work itself (stage 5): they name the order but do not carry its zones. */
export type WorkNotification = Extract<
  Notification,
  {
    type:
      | 'act.confirm_request'
      | 'extra.approval_request'
      | 'order.ready'
      | 'staff.task_assigned'
      | 'staff.task_rework'
      | 'staff.report_submitted'
      | 'staff.extra_decided';
  }
>;

/** The messages that are about an order and so carry its facts. */
export type OrderNotification = Exclude<
  Notification,
  { type: 'staff.deletion_requested' } | WorkNotification
>;

/** What the outbox stores: the language is the recipient's at the time of writing. */
export const outboxPayloadSchema = z.object({
  lang: z.enum(LANGS),
  notification: notificationSchema,
});
export type OutboxPayload = z.infer<typeof outboxPayloadSchema>;

/** The button under a message: where it leads is decided when it is sent (it needs the URLs). */
export interface MessageButton {
  text: string;
  /** `order` and `task`: that screen in the Mini App; `panel`: the web panel. */
  target: 'order' | 'task' | 'panel';
  orderId: string | null;
  taskId?: string | null;
}

/** A button that answers in the chat itself ("Tasdiqlayman"): the bot's handler reads `data`. */
export interface MessageAction {
  text: string;
  /** At most 64 bytes, in the form the bot's handlers expect (see bot/actions.ts). */
  data: string;
}

export interface RenderedMessage {
  /** HTML; every value in it is escaped. */
  text: string;
  button: MessageButton | null;
  /** Buttons that answer in the chat; each goes on its own row above the link button. */
  actions?: readonly MessageAction[];
}
