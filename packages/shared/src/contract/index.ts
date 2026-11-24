import { z } from 'zod';
import { LANGS } from '../i18n';
import type { RouteName } from '../routes';
import {
  ACT_CONFIRM_CHANNELS,
  ACT_STATUSES,
  AVAILABILITIES,
  ADMIN_TASK_TABS,
  MASTER_TASK_TABS,
  TASK_PHOTO_KINDS,
  TASK_STATUSES,
  API_ERROR_CODES,
  DEFECT_KINDS,
  DEFECT_VIEWS,
  PHOTO_SIDES,
  BODY_CLASSES,
  ITEM_APPROVALS,
  ORDER_ITEM_KINDS,
  ORDER_STATUSES,
  ORDER_TABS,
  BOOKING_KINDS,
  CALL_OUTCOMES,
  CLIENT_FILTERS,
  LIMITS,
  MANUAL_DOCUMENT_KINDS,
  MAX_CONTACT_LENGTH,
  ORDER_SOURCES,
  PAYMENT_METHODS,
  PERMISSIONS,
  PRODUCT_UNITS,
  ROLES,
  RULE_LIMITS,
  SERVICE_GROUPS,
  SHELLS,
  SHOP_FULFILLMENTS,
  SHOP_ORDER_SOURCES,
  SHOP_ORDER_STATUSES,
  SHOP_ORDER_TABS,
  SHOP_SORTS,
  STOCK_DOCUMENT_KINDS,
  STOCK_DOCUMENT_STATUSES,
  STOCK_FILTERS,
  STOCK_STATES,
  WRITE_OFF_REASONS,
} from '../vocabulary';

/**
 * The API contract: the request and response schemas of every route in ../routes.
 *
 * Conventions (docs/PLAN.md, section 4.6): camelCase; money is a whole number of so‘m; an instant
 * travels with its ready-made local date and time, so clients never deal with time zones.
 */

const id = z.uuid();
const lang = z.enum(LANGS);
const role = z.enum(ROLES);
const localDate = z.iso.date();
const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** An instant and how the workshop's clock shows it. */
export const instantSchema = z.object({ at: z.iso.datetime(), date: localDate, time: localTime });
export type Instant = z.infer<typeof instantSchema>;

const fullName = z.string().trim().min(LIMITS.fullName.min).max(LIMITS.fullName.max);
const password = z.string().min(LIMITS.password.min).max(LIMITS.password.max);
const bodyClass = z.enum(BODY_CLASSES);
const serviceGroup = z.enum(SERVICE_GROUPS);
/** A name of reference data: a brand, a model, a zone, a box. */
const name = z.string().trim().min(LIMITS.name.min).max(LIMITS.name.max);
const sort = z.number().int().min(0).max(10_000);
/** Links shown to clients open in the browser: only https, never `javascript:` and the like. */
const httpsUrl = z.url({ protocol: /^https$/ }).max(LIMITS.url.max);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    /** Which request fields failed validation. */
    paths: z.array(z.string()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------------------------------------------------------------------------------------------
// tma.*: the Mini App, any Telegram user

/** What the workshop shows about itself to everyone (docs/PLAN.md, section 7.4). */
export const workshopInfoSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  /** +998XXXXXXXXX, for "call the workshop". */
  phone: z.string().nullable(),
  mapUrl: z.string().nullable(),
  /** The privacy policy; null until the owner enters it. */
  policyUrl: z.string().nullable(),
});
export type WorkshopInfo = z.infer<typeof workshopInfoSchema>;

/** The first answer of every visit: who the user is and which part of the app to open. */
export const bootstrapSchema = z.object({
  user: z.object({
    id,
    fullName: z.string(),
    lang,
    /** Verified by Telegram; null until the user shares it. */
    phone: z.string().nullable(),
    consentGiven: z.boolean(),
    remindersEnabled: z.boolean(),
  }),
  shell: z.enum(SHELLS),
  roles: z.array(role),
  links: z.object({
    /** The web panel, for the staff part; null until PUBLIC_URL is set. */
    admin: z.string().nullable(),
  }),
  workshop: workshopInfoSchema,
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;

// ---------------------------------------------------------------------------------------------
// auth.* and admin.*: the panel

export const meSchema = z.object({
  id,
  fullName: z.string(),
  lang,
  roles: z.array(role),
  permissions: z.array(z.enum(PERMISSIONS)),
});
export type Me = z.infer<typeof meSchema>;

export const staffSchema = z.object({
  id,
  fullName: z.string(),
  phone: z.string(),
  roles: z.array(role),
  specialization: z.string().nullable(),
  login: z.string().nullable(),
  isBlocked: z.boolean(),
  /** The person has opened the bot and shared this phone number. */
  telegramLinked: z.boolean(),
  lastSeen: instantSchema.nullable(),
});
export type Staff = z.infer<typeof staffSchema>;

const staffFields = {
  fullName,
  phone: z.string().trim().min(1).max(32),
  roles: z.array(role).min(1),
  specialization: z.string().trim().max(LIMITS.specialization.max).nullable(),
  login: z.string().trim().max(64).nullable(),
};

export const auditEntrySchema = z.object({
  id,
  at: instantSchema,
  actor: z.object({ id, fullName: z.string() }).nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

// ---------------------------------------------------------------------------------------------
// admin.*: the owner's settings (stage 2, docs/PLAN.md, sections 7.4 and 7.5)

const wholeNumber = (min: number, max: number) => z.number().int().min(min).max(max);

const limited = (limits: { min: number; max: number }) => wholeNumber(limits.min, limits.max);

export const workshopSettingsSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.workshopName.max),
  address: z.string().trim().min(1).max(LIMITS.address.max).nullable(),
  /** The server stores it as +998XXXXXXXXX. */
  phone: z.string().trim().min(1).max(32).nullable(),
  mapUrl: httpsUrl.nullable(),
  policyUrl: httpsUrl.nullable(),
  /** What clients agree to is recorded with this version (TZ 15.3). */
  policyVersion: z.string().trim().min(1).max(64),
});

export const rulesSchema = z
  .object({
    /** Start times of a booking are this many minutes apart. */
    slotStepMin: limited(RULE_LIMITS.slotStepMin),
    /** The earliest bookable time is this far from now. */
    minLeadMin: limited(RULE_LIMITS.minLeadMin),
    horizonDays: limited(RULE_LIMITS.horizonDays),
    /** Added to every job before the next car may enter the box. */
    bufferMin: limited(RULE_LIMITS.bufferMin),
    /** A new request is held this many working minutes, waiting for the call. */
    holdNewWorkMin: limited(RULE_LIMITS.holdNewWorkMin),
    /** After "no answer" the request is held this many hours more. */
    holdNoAnswerHours: limited(RULE_LIMITS.holdNoAnswerHours),
    callWarnMin: limited(RULE_LIMITS.callWarnMin),
    callEscalateMin: limited(RULE_LIMITS.callEscalateMin),
    /** How many hours before the visit the client is reminded. */
    reminderHours: z
      .array(wholeNumber(RULE_LIMITS.reminderHours.min, RULE_LIMITS.reminderHours.max))
      .max(RULE_LIMITS.reminderHours.count),
    adminDiscountLimitPct: limited(RULE_LIMITS.adminDiscountLimitPct),
    /** A gathered shop order waits this many hours to be picked up (stage 9). */
    shopPickupHours: limited(RULE_LIMITS.shopPickupHours),
  })
  .refine((rules) => rules.callEscalateMin > rules.callWarnMin, {
    path: ['callEscalateMin'],
    message: 'must be later than callWarnMin',
  });

export const settingsSchema = z.object({ workshop: workshopSettingsSchema, rules: rulesSchema });
export type Settings = z.infer<typeof settingsSchema>;
export type WorkshopSettings = z.infer<typeof workshopSettingsSchema>;
export type Rules = z.infer<typeof rulesSchema>;

export const workDaySchema = z.object({
  /** 1 = Monday … 7 = Sunday. A weekday without an entry is a day off. */
  weekday: wholeNumber(1, 7),
  open: localTime,
  close: localTime,
  breakStart: localTime.nullable(),
  breakEnd: localTime.nullable(),
});
export type WorkDay = z.infer<typeof workDaySchema>;

export const holidaySchema = z.object({ date: localDate, name });
export type Holiday = z.infer<typeof holidaySchema>;

export const workHoursSchema = z.object({
  days: z.array(workDaySchema),
  holidays: z.array(holidaySchema),
});
export type WorkHours = z.infer<typeof workHoursSchema>;

const boxNote = z.string().trim().min(1).max(LIMITS.note.max).nullable();

export const boxSchema = z.object({
  id,
  name: z.string(),
  note: z.string().nullable(),
  sort: z.number().int(),
  isActive: z.boolean(),
  /** The kinds of work this box can do (a box can take a job only if it does all of its kinds). */
  serviceTypeIds: z.array(id),
});
export type Box = z.infer<typeof boxSchema>;

export const modelSchema = z.object({
  id,
  brandId: id,
  name: z.string(),
  bodyClass,
  sort: z.number().int(),
  isActive: z.boolean(),
});
export type CarModel = z.infer<typeof modelSchema>;

export const brandSchema = z.object({
  id,
  name: z.string(),
  sort: z.number().int(),
  isActive: z.boolean(),
  models: z.array(modelSchema),
});
export type CarBrand = z.infer<typeof brandSchema>;

export const serviceTypeSchema = z.object({
  id,
  code: z.string(),
  nameUz: z.string(),
  nameRu: z.string(),
  /** A Lucide icon name; the Mini App maps it to a bundled icon. */
  icon: z.string(),
  sort: z.number().int(),
  isActive: z.boolean(),
});
export type ServiceType = z.infer<typeof serviceTypeSchema>;

/** Price and working time of one zone for one body class. No price means "to be agreed". */
export const priceCellSchema = z.object({
  bodyClass,
  price: wholeNumber(0, LIMITS.price.max).nullable(),
  durationMin: wholeNumber(LIMITS.durationMin.min, LIMITS.durationMin.max),
});
export type PriceCell = z.infer<typeof priceCellSchema>;

export const serviceSchema = z.object({
  id,
  serviceTypeId: id,
  nameUz: z.string(),
  nameRu: z.string(),
  group: serviceGroup,
  /** "Other": the price is always agreed. */
  isCustom: z.boolean(),
  sort: z.number().int(),
  isActive: z.boolean(),
  /** Choosing this zone drops these ones ("whole body" covers the panels). */
  excludes: z.array(id),
  /** The classes this zone is offered for; a class without a cell is not offered. */
  cells: z.array(priceCellSchema),
});
export type Service = z.infer<typeof serviceSchema>;

export const priceMatrixSchema = z.object({
  serviceType: serviceTypeSchema,
  services: z.array(serviceSchema),
});
export type PriceMatrix = z.infer<typeof priceMatrixSchema>;

const serviceTypeFields = {
  nameUz: name,
  nameRu: name,
  icon: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]{0,39}$/),
};
const serviceFields = {
  nameUz: name,
  nameRu: name,
  group: serviceGroup,
};

const atLeastOne = { message: 'nothing to change' };
const hasChange = (body: object) => Object.values(body).some((value) => value !== undefined);
const done = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------------------------
// client.*: the garage and booking (stage 3, docs/PLAN.md, sections 7.6–7.8, 10, 13)

const plateInput = z.string().trim().min(4).max(16);
const comment = z.string().trim().min(1).max(LIMITS.note.max);

export const clientCatalogSchema = z.object({
  brands: z.array(
    z.object({
      id,
      name: z.string(),
      models: z.array(z.object({ id, name: z.string(), bodyClass })),
    }),
  ),
  serviceTypes: z.array(
    z.object({
      id,
      code: z.string(),
      nameUz: z.string(),
      nameRu: z.string(),
      icon: z.string(),
      zones: z.array(
        z.object({
          id,
          nameUz: z.string(),
          nameRu: z.string(),
          group: serviceGroup,
          isCustom: z.boolean(),
          /** Choosing this zone drops these. */
          excludes: z.array(id),
          /** The classes this zone is offered for. */
          prices: z.array(priceCellSchema),
        }),
      ),
    }),
  ),
  /** What a client may give as the reason for cancelling. */
  cancelReasons: z.array(
    z.object({ id, nameUz: z.string(), nameRu: z.string(), requiresText: z.boolean() }),
  ),
});
export type ClientCatalog = z.infer<typeof clientCatalogSchema>;

export const carSchema = z.object({
  id,
  modelId: id.nullable(),
  brand: z.string().nullable(),
  /** The model's name, or what the client typed for "Other". */
  model: z.string(),
  customModelText: z.string().nullable(),
  bodyClass,
  year: z.number().int(),
  /** Normalised: upper case, no spaces. */
  plate: z.string(),
  color: z.string().nullable(),
});
export type Car = z.infer<typeof carSchema>;

const carFields = {
  year: z.number().int().min(1950).max(2100),
  plate: plateInput,
  color: z.string().trim().min(1).max(40).nullable(),
};

const serviceIdList = z.array(id).min(1).max(30);
/** A list in a query string is written with commas. */
const serviceIdsQuery = z
  .string()
  .transform((value) => value.split(',').filter(Boolean))
  .pipe(serviceIdList);

export const quoteSchema = z.object({
  items: z.array(
    z.object({
      serviceId: id,
      nameUz: z.string(),
      nameRu: z.string(),
      typeNameUz: z.string(),
      typeNameRu: z.string(),
      /** Null: the price is agreed with the client. */
      price: z.number().int().nullable(),
      durationMin: z.number().int(),
    }),
  ),
  /** The total of the zones that have a price. */
  subtotal: z.number().int(),
  /** How many zones have no price yet ("to be agreed"). */
  unpricedCount: z.number().int(),
  /** The zones' working minutes added up. */
  workMinutes: z.number().int(),
  bufferMin: z.number().int(),
  /** The working minutes plus the buffer: how long a box is held. */
  totalMinutes: z.number().int(),
  /** The job takes more than one working day: the client picks the day it is handed over. */
  multiDay: z.boolean(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const slotSchema = z.object({
  startsAt: instantSchema,
  /** When the job is done. */
  endsAt: instantSchema,
  free: z.boolean(),
  boxName: z.string().nullable(),
});
export type Slot = z.infer<typeof slotSchema>;

export const availabilitySchema = z.object({
  days: z.array(
    z.object({
      date: localDate,
      state: z.enum(['free', 'full', 'closed']),
      closedReason: z.enum(['holiday', 'day_off']).nullable(),
    }),
  ),
  multiDay: z.boolean(),
});
export type Availability = z.infer<typeof availabilitySchema>;

export const slotsSchema = z.object({
  date: localDate,
  slots: z.array(slotSchema),
  /** The first free times after this day, when it has none. */
  nearest: z.array(slotSchema),
  multiDay: z.boolean(),
});
export type Slots = z.infer<typeof slotsSchema>;

export const orderStatusSchema = z.enum(ORDER_STATUSES);

/** How far a zone of an order has got (design T6): waiting its turn, being done, done. */
export const ZONE_PROGRESS = ['queued', 'in_progress', 'ready'] as const;

const orderItemView = z.object({
  id,
  /** Extra work found during the work is asked of the client before it counts. */
  kind: z.enum(ORDER_ITEM_KINDS),
  approval: z.enum(ITEM_APPROVALS),
  /** Null until the work begins, and for work that was refused. */
  progress: z.enum(ZONE_PROGRESS).nullable(),
  nameUz: z.string(),
  nameRu: z.string(),
  typeNameUz: z.string(),
  typeNameRu: z.string(),
  price: z.number().int().nullable(),
  durationMin: z.number().int(),
  /** Extra work waiting for the client: the order's total if they agree (discount included). */
  totalIfApproved: z.number().int().nullable(),
});

export const orderSchema = z.object({
  id,
  /** The number people read out: 1042. */
  number: z.number().int(),
  status: orderStatusSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  car: z.object({ label: z.string(), plate: z.string() }),
  items: z.array(orderItemView),
  subtotal: z.number().int(),
  unpricedCount: z.number().int(),
  /** Off the whole order (docs/PLAN.md, section 11); `total = subtotal - discount.amount`. */
  discount: z
    .object({
      amount: z.number().int(),
      /** Null when it was given as an amount. */
      percent: z.number().nullable(),
      reason: z.string().nullable(),
    })
    .nullable(),
  total: z.number().int(),
  comment: z.string().nullable(),
  /** The slot is held until then, waiting for the workshop's call (only while new). */
  holdUntil: instantSchema.nullable(),
  rescheduleRequested: z.boolean(),
  boxName: z.string().nullable(),
  /** What the client may do now: the server decides, the app only shows. */
  canCancel: z.boolean(),
  canRequestReschedule: z.boolean(),
  /** The client's stars and words about finished work (stage 6). */
  review: z.object({ rating: z.number().int(), text: z.string().nullable() }).nullable(),
  /** The order is finished and not rated yet. */
  canRate: z.boolean(),
  /** Rated in the bot, no words yet: the app may add them. */
  canComment: z.boolean(),
  /** The steps the order has been through, oldest first. */
  history: z.array(z.object({ status: orderStatusSchema, at: instantSchema })),
});
export type Order = z.infer<typeof orderSchema>;

export const orderListSchema = z.object({ items: z.array(orderSchema) });

// ---------------------------------------------------------------------------------------------
// admin.*: orders, the schedule and clients (stage 4, docs/PLAN.md, sections 9.1, 10.4, 13)

const clientRef = z.object({
  id,
  fullName: z.string(),
  phone: z.string().nullable(),
  /** The client can be messaged in Telegram. */
  hasTelegram: z.boolean(),
});

/** An order as the staff see it: the client's view, and who, how and what may be done. */
export const adminOrderSchema = orderSchema.extend({
  items: z.array(
    orderItemView.extend({ serviceId: id, comment: z.string().nullable(), taskId: id.nullable() }),
  ),
  source: z.enum(ORDER_SOURCES),
  client: clientRef,
  carId: id,
  bodyClass,
  createdAt: instantSchema,
  /** Working minutes it has waited for a call; null once someone has called, or if not new. */
  waitingMin: z.number().int().nullable(),
  /** Waiting longer than the rules allow: the card turns red (design A1). */
  callWarn: z.boolean(),
  calls: z.array(
    z.object({
      id,
      outcome: z.enum(CALL_OUTCOMES),
      note: z.string().nullable(),
      at: instantSchema,
      adminName: z.string(),
    }),
  ),
  cancelReason: z.object({ uz: z.string(), ru: z.string() }).nullable(),
  /** What the staff may do now; the server decides, the panel shows. */
  actions: z.object({
    canCall: z.boolean(),
    canEditItems: z.boolean(),
    canReschedule: z.boolean(),
    canCancel: z.boolean(),
    canNoShow: z.boolean(),
    /** Give or change the discount (stage 6). */
    canDiscount: z.boolean(),
    /** Price a zone "to be agreed" after the work began. */
    canPriceItems: z.boolean(),
    /** Hand the car over and take the money. */
    canCheckout: z.boolean(),
  }),
});
export type AdminOrder = z.infer<typeof adminOrderSchema>;

export const adminOrderListSchema = z.object({ items: z.array(adminOrderSchema) });

export const todaySchema = z.object({
  /** The server's clock: the panel never works out the time itself. */
  now: instantSchema,
  counters: z.object({
    /** New requests waiting for a call. */
    newOrders: z.number().int(),
    /** Of them, the ones waiting longer than the rules allow. */
    unanswered: z.number().int(),
    arrivalsToday: z.number().int(),
    inWork: z.number().int(),
    readyForPickup: z.number().int(),
  }),
  arrivals: z.array(adminOrderSchema),
});
export type Today = z.infer<typeof todaySchema>;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/** The day's takings (design A6, "Bugungi kassa"): by method, in all, and how many receipts. */
export const cashSchema = z.object({
  byMethod: z.array(z.object({ method: paymentMethodSchema, amount: z.number().int() })),
  total: z.number().int(),
  receipts: z.number().int(),
});
export type Cash = z.infer<typeof cashSchema>;

export const scheduleSchema = z.object({
  date: localDate,
  /** The server's clock, for the "now" line. */
  now: instantSchema,
  /** The day's working hours; null on a day off or a holiday. */
  hours: z
    .object({
      open: localTime,
      close: localTime,
      breakStart: localTime.nullable(),
      breakEnd: localTime.nullable(),
    })
    .nullable(),
  closedReason: z.enum(['holiday', 'day_off']).nullable(),
  boxes: z.array(
    z.object({
      id,
      name: z.string(),
      items: z.array(
        z.object({
          id,
          kind: z.enum(BOOKING_KINDS),
          startsAt: instantSchema,
          endsAt: instantSchema,
          /** Why a block exists. */
          note: z.string().nullable(),
          order: z
            .object({
              id,
              number: z.number().int(),
              status: orderStatusSchema,
              clientName: z.string(),
              carLabel: z.string(),
              plate: z.string(),
            })
            .nullable(),
        }),
      ),
    }),
  ),
});
export type Schedule = z.infer<typeof scheduleSchema>;

export const clientSummarySchema = z.object({
  id,
  fullName: z.string(),
  phone: z.string().nullable(),
  hasTelegram: z.boolean(),
  carsCount: z.number().int(),
  ordersCount: z.number().int(),
  /** The last visit: the start of the latest completed order. */
  lastVisit: instantSchema.nullable(),
  deletionRequested: z.boolean(),
  isAnonymized: z.boolean(),
});
export type ClientSummary = z.infer<typeof clientSummarySchema>;

export const clientCardSchema = clientSummarySchema.extend({
  /** The number was verified by Telegram, so the account is linked to it. */
  phoneVerified: z.boolean(),
  /** The person's Telegram account id; null without Telegram or once the data is erased. */
  telegramId: z.number().int().nullable(),
  internalNote: z.string().nullable(),
  cars: z.array(carSchema),
  orders: z.array(adminOrderSchema),
});
export type ClientCard = z.infer<typeof clientCardSchema>;

/** A car added with "Other": the workshop ties it to a real model (docs/PLAN.md, section 7.6). */
export const unmappedCarSchema = z.object({
  id,
  clientId: id,
  clientName: z.string(),
  /** What the client typed for the model. */
  customModelText: z.string().nullable(),
  bodyClass,
  year: z.number().int(),
  plate: z.string(),
  color: z.string().nullable(),
});
export type UnmappedCar = z.infer<typeof unmappedCarSchema>;

// ---------------------------------------------------------------------------------------------
// Stage 5: the reception act (docs/PLAN.md, sections 7.9 and 9.4)

/** The bytes of a photo, sent as they are and not as JSON. */
export const photoBytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array, 'bytes');

const checklistSchema = z.object({
  spareWheel: z.boolean().optional(),
  jack: z.boolean().optional(),
  mats: z.boolean().optional(),
  documents: z.boolean().optional(),
});
export type Checklist = z.infer<typeof checklistSchema>;

const defectPoint = z.number().min(0).max(1);

const actDefectInputSchema = z.object({
  view: z.enum(DEFECT_VIEWS),
  /** Where on the picture of the view, 0–1 from the top left. */
  x: defectPoint,
  y: defectPoint,
  kind: z.enum(DEFECT_KINDS),
  note: z.string().trim().min(1).max(LIMITS.note.max).nullable(),
  /** A photo of the defect, uploaded before: its id. */
  mediaId: id.nullable(),
});

/** The act as the admin fills it in; the defects are the whole list every time. */
export const actDraftSchema = z.object({
  mileageKm: z.number().int().min(0).max(LIMITS.mileageKm.max).nullable(),
  fuelLevel: z.number().int().min(0).max(4).nullable(),
  checklist: checklistSchema,
  personalItems: z.string().trim().min(1).max(LIMITS.personalItems.max).nullable(),
  defects: z.array(actDefectInputSchema).max(LIMITS.defects.max),
});

export type ActDraft = z.infer<typeof actDraftSchema>;

/** A photo and the signed path that opens it for fifteen minutes. */
const photoLinkSchema = z.object({ mediaId: id, url: z.string() });
export type PhotoLink = z.infer<typeof photoLinkSchema>;

/** What an act still lacks before it can be sent. */
const actMissingSchema = z.enum(['mileage', 'fuel', ...PHOTO_SIDES]);

export const receptionActSchema = z.object({
  status: z.enum(ACT_STATUSES),
  mileageKm: z.number().int().nullable(),
  fuelLevel: z.number().int().nullable(),
  checklist: checklistSchema,
  personalItems: z.string().nullable(),
  sides: z.array(photoLinkSchema.extend({ side: z.enum(PHOTO_SIDES) })),
  defects: z.array(
    z.object({
      id,
      view: z.enum(DEFECT_VIEWS),
      x: z.number(),
      y: z.number(),
      kind: z.enum(DEFECT_KINDS),
      note: z.string().nullable(),
      photo: photoLinkSchema.nullable(),
    }),
  ),
  sentAt: instantSchema.nullable(),
  confirmedAt: instantSchema.nullable(),
  confirmedVia: z.enum(ACT_CONFIRM_CHANNELS).nullable(),
  missing: z.array(actMissingSchema),
});
export type ReceptionAct = z.infer<typeof receptionActSchema>;

/** The admin's view of an order's act: the act (none yet) and what may be done with it now. */
export const adminActSchema = z.object({
  act: receptionActSchema.nullable(),
  /** The order is confirmed and the act has not been signed: it may be filled in or changed. */
  canEdit: z.boolean(),
  canSend: z.boolean(),
  canConfirmVerbal: z.boolean(),
  /** The act is confirmed and the order waits to be handed to the masters. */
  canStartWork: z.boolean(),
});
export type AdminAct = z.infer<typeof adminActSchema>;

export const clientActSchema = z.object({
  /** Null until the workshop has sent it. */
  act: receptionActSchema.nullable(),
  canConfirm: z.boolean(),
});
export type ClientAct = z.infer<typeof clientActSchema>;

// ---------------------------------------------------------------------------------------------
// Stage 5: the masters' tasks (docs/PLAN.md, sections 7.10 and 9.2)

const taskStatusSchema = z.enum(TASK_STATUSES);

/** A zone of a task: what it is called and its norm. A master never sees a price. */
const taskItemSchema = z.object({
  id,
  nameUz: z.string(),
  nameRu: z.string(),
  durationMin: z.number().int(),
  comment: z.string().nullable(),
});

const taskPhotoSchema = photoLinkSchema.extend({
  kind: z.enum(TASK_PHOTO_KINDS),
  attempt: z.number().int(),
});
export type TaskPhoto = z.infer<typeof taskPhotoSchema>;

const carRef = z.object({ label: z.string(), plate: z.string() });

/** One line of the master's list. */
export const masterTaskSummarySchema = z.object({
  id,
  orderNumber: z.number().int(),
  status: taskStatusSchema,
  car: carRef,
  items: z.array(taskItemSchema),
  normMinutes: z.number().int(),
  startedAt: instantSchema.nullable(),
  reworkCount: z.number().int(),
  /** What the admin said when sending the report back, to show on the card (design U1). */
  lastRemark: z.string().nullable(),
  boxName: z.string().nullable(),
  /**
   * Seconds since the work began, counted by the server at the moment of the answer: the phone
   * only adds the time that passed since it got it, and never reads its own date (design U1).
   */
  elapsedSec: z.number().int().nullable(),
});
export type MasterTaskSummary = z.infer<typeof masterTaskSummarySchema>;

/** The master's task: no client phone, no prices, nothing of other masters' work. */
export const masterTaskSchema = masterTaskSummarySchema.extend({
  instruction: z.string(),
  /** The attempt the master is on: a rework starts a new one. */
  attempt: z.number().int(),
  /** The photos of the current attempt. */
  photos: z.array(taskPhotoSchema),
  /** The defects the client confirmed at reception: not the master's doing. */
  defects: receptionActSchema.shape.defects,
  actConfirmedVia: z.enum(ACT_CONFIRM_CHANNELS).nullable(),
  canStart: z.boolean(),
  canPhoto: z.boolean(),
  canSubmit: z.boolean(),
});
export type MasterTask = z.infer<typeof masterTaskSchema>;

export const masterTaskListSchema = z.object({ items: z.array(masterTaskSummarySchema) });

const userRef = z.object({ id, fullName: z.string() });

export const adminTaskSummarySchema = z.object({
  id,
  orderId: id,
  orderNumber: z.number().int(),
  status: taskStatusSchema,
  car: carRef,
  master: userRef,
  assistant: userRef.nullable(),
  items: z.array(taskItemSchema.extend({ price: z.number().int().nullable() })),
  instruction: z.string(),
  normMinutes: z.number().int(),
  startedAt: instantSchema.nullable(),
  submittedAt: instantSchema.nullable(),
  acceptedAt: instantSchema.nullable(),
  reworkCount: z.number().int(),
  lastRemark: z.string().nullable(),
});
export type AdminTaskSummary = z.infer<typeof adminTaskSummarySchema>;

/** The admin's check (design A3): each attempt with its photos, the master's words and the decision. */
export const adminTaskSchema = adminTaskSummarySchema.extend({
  attempts: z.array(
    z.object({
      attempt: z.number().int(),
      photos: z.array(taskPhotoSchema),
      /** Null while the master has not handed this attempt in. */
      comment: z.string().nullable(),
      submittedAt: instantSchema.nullable(),
      decision: z.enum(['accepted', 'rework']).nullable(),
      remark: z.string().nullable(),
      decidedAt: instantSchema.nullable(),
    }),
  ),
  canAccept: z.boolean(),
  canRework: z.boolean(),
  canReassign: z.boolean(),
});
export type AdminTask = z.infer<typeof adminTaskSchema>;

export const adminTaskListSchema = z.object({ items: z.array(adminTaskSummarySchema) });

// ---------------------------------------------------------------------------------------------
// Stage 8: the warehouse (docs/PLAN.md, sections 7.14 and 9.6)

/** A quantity in the product's unit, to three decimals; the server checks it against the unit. */
const qty = z.number().min(0).max(LIMITS.qty.max);
const productUnit = z.enum(PRODUCT_UNITS);
const optionalLine = (max: number) => z.string().trim().min(1).max(max).nullable();

export const productCategorySchema = z.object({
  id,
  /** Null for a top-level category. */
  parentId: id.nullable(),
  nameUz: z.string(),
  nameRu: z.string(),
  sort: z.number().int(),
  isActive: z.boolean(),
});
export type ProductCategory = z.infer<typeof productCategorySchema>;

const categoryFields = { nameUz: name, nameRu: name };

/** The free stock and how it stands against the minimum. */
const stockFiguresSchema = z.object({
  onHand: z.number(),
  reserved: z.number(),
  free: z.number(),
  state: z.enum(STOCK_STATES),
});
export type StockFigures = z.infer<typeof stockFiguresSchema>;

/** Purchase prices; null for who may not see them (costs.read, PLAN 8). */
const productCostsSchema = z
  .object({ avgCost: z.number().int(), lastCost: z.number().int().nullable() })
  .nullable();

export const productSchema = z.object({
  id,
  sku: z.string(),
  barcode: z.string().nullable(),
  nameUz: z.string(),
  nameRu: z.string(),
  descriptionUz: z.string().nullable(),
  descriptionRu: z.string().nullable(),
  categoryId: id,
  brand: z.string().nullable(),
  unit: productUnit,
  pack: z.string().nullable(),
  isForSale: z.boolean(),
  isConsumable: z.boolean(),
  sellPrice: z.number().int().nullable(),
  minQty: z.number(),
  sort: z.number().int(),
  isActive: z.boolean(),
  photos: z.array(photoLinkSchema),
  stock: stockFiguresSchema,
  costs: productCostsSchema,
});
export type Product = z.infer<typeof productSchema>;

const productFields = {
  sku: z.string().trim().min(LIMITS.sku.min).max(LIMITS.sku.max),
  barcode: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${LIMITS.barcode.min},${LIMITS.barcode.max}}$`))
    .nullable(),
  nameUz: name,
  nameRu: name,
  descriptionUz: optionalLine(LIMITS.description.max),
  descriptionRu: optionalLine(LIMITS.description.max),
  categoryId: id,
  brand: optionalLine(LIMITS.brand.max),
  unit: productUnit,
  pack: optionalLine(LIMITS.pack.max),
  isForSale: z.boolean(),
  isConsumable: z.boolean(),
  sellPrice: z.number().int().min(0).max(LIMITS.price.max).nullable(),
  minQty: qty,
};

export const supplierSchema = z.object({
  id,
  name: z.string(),
  phone: z.string().nullable(),
  inn: z.string().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
});
export type Supplier = z.infer<typeof supplierSchema>;

const supplierFields = {
  name,
  phone: z.string().trim().min(1).max(32).nullable(),
  inn: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${LIMITS.inn.min},${LIMITS.inn.max}}$`))
    .nullable(),
  note: optionalLine(LIMITS.note.max),
};

/** A row of the stock list (design A5). */
export const stockRowSchema = z.object({
  productId: id,
  sku: z.string(),
  nameUz: z.string(),
  nameRu: z.string(),
  categoryNameUz: z.string(),
  categoryNameRu: z.string(),
  unit: productUnit,
  isForSale: z.boolean(),
  isConsumable: z.boolean(),
  minQty: z.number(),
  isActive: z.boolean(),
  stock: stockFiguresSchema,
  /** Null without costs.read: the average cost and what the stock is worth at it. */
  costs: z.object({ avgCost: z.number().int(), value: z.number().int() }).nullable(),
});
export type StockRow = z.infer<typeof stockRowSchema>;

const documentRefSchema = z.object({
  id,
  number: z.number().int(),
  kind: z.enum(STOCK_DOCUMENT_KINDS),
});

/** One line of the journal: a posted document moved this much of a product. */
export const stockMovementSchema = z.object({
  id,
  at: instantSchema,
  productId: id,
  nameUz: z.string(),
  nameRu: z.string(),
  unit: productUnit,
  delta: z.number(),
  /** Null without costs.read. */
  unitCost: z.number().int().nullable(),
  document: documentRefSchema,
  actorName: z.string().nullable(),
});
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const stockDocumentLineSchema = z.object({
  productId: id,
  sku: z.string(),
  nameUz: z.string(),
  nameRu: z.string(),
  unit: productUnit,
  qty: z.number(),
  /** The invoice price of a receipt line. */
  unitCost: z.number().int().nullable(),
  /** What the books said when an inventory was posted; null before. */
  expectedQty: z.number().nullable(),
  /** For a draft: the stock now and after posting, so the screen can show "12,3 → 42,3". */
  onHandNow: z.number().nullable(),
  onHandAfter: z.number().nullable(),
});
export type StockDocumentLine = z.infer<typeof stockDocumentLineSchema>;

export const stockDocumentSchema = z.object({
  id,
  number: z.number().int(),
  kind: z.enum(STOCK_DOCUMENT_KINDS),
  status: z.enum(STOCK_DOCUMENT_STATUSES),
  supplier: z.object({ id, name: z.string() }).nullable(),
  invoiceNo: z.string().nullable(),
  invoiceDate: localDate.nullable(),
  reason: z.enum(WRITE_OFF_REASONS).nullable(),
  note: z.string().nullable(),
  invoicePhoto: photoLinkSchema.nullable(),
  lines: z.array(stockDocumentLineSchema),
  /** The sum of a receipt at its invoice prices; null for the other kinds. */
  total: z.number().int().nullable(),
  createdAt: instantSchema,
  createdBy: z.string(),
  postedAt: instantSchema.nullable(),
  postedBy: z.string().nullable(),
});
export type StockDocument = z.infer<typeof stockDocumentSchema>;

export const stockDocumentSummarySchema = stockDocumentSchema
  .pick({
    id: true,
    number: true,
    kind: true,
    status: true,
    supplier: true,
    invoiceNo: true,
    reason: true,
    total: true,
    createdAt: true,
    postedAt: true,
  })
  .extend({ lineCount: z.number().int() });
export type StockDocumentSummary = z.infer<typeof stockDocumentSummarySchema>;

/** What a person writes into a document: the whole list of lines every time. */
const stockDocumentFields = {
  supplierId: id.nullable(),
  invoiceNo: optionalLine(LIMITS.invoiceNo.max),
  invoiceDate: localDate.nullable(),
  reason: z.enum(WRITE_OFF_REASONS).nullable(),
  note: optionalLine(LIMITS.note.max),
  lines: z
    .array(
      z.object({
        productId: id,
        qty,
        unitCost: z.number().int().min(0).max(LIMITS.price.max).nullable(),
      }),
    )
    .max(LIMITS.documentLines.max),
};

/** Below the minimum (the "Bugun" block). */
export const lowStockItemSchema = z.object({
  productId: id,
  nameUz: z.string(),
  nameRu: z.string(),
  unit: productUnit,
  free: z.number(),
  minQty: z.number(),
});
export type LowStockItem = z.infer<typeof lowStockItemSchema>;

// ---------------------------------------------------------------------------------------------
// Stage 6: handover and payment (docs/PLAN.md, sections 7.12, 9.1 and 11)

/** The "Bugun" screen (design A6) with the reports to check and the day's takings. */
export const dashboardSchema = todaySchema.extend({
  /** Reports waiting for the admin's check, oldest first; empty for who may not check them. */
  reports: z.array(adminTaskSummarySchema.extend({ waitingMin: z.number().int() })),
  /** Null for who may not see the money. */
  cash: cashSchema.nullable(),
  /** Below the minimum (stage 8); null for who may not see the warehouse. */
  lowStock: z.array(lowStockItemSchema).nullable(),
  /** Shop orders to call about and to hand over (stage 9); null without shop.read. */
  shop: z.object({ newOrders: z.number().int(), readyForPickup: z.number().int() }).nullable(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

/** The photos of one task's work: before it began and of the attempt that was accepted. */
const workPhotosSchema = z.object({
  taskId: id,
  items: z.array(z.object({ nameUz: z.string(), nameRu: z.string() })),
  before: z.array(photoLinkSchema),
  after: z.array(photoLinkSchema),
});
export type WorkPhotos = z.infer<typeof workPhotosSchema>;

export const paymentSchema = z.object({
  id,
  method: paymentMethodSchema,
  amount: z.number().int(),
  receivedAt: instantSchema,
});

export const receiptSchema = z.object({
  receiptNo: z.string(),
  amount: z.number().int(),
  createdAt: instantSchema,
});

/** The handover (design A8): what was done and by whom, what to take, and what was taken. */
export const handoverSchema = z.object({
  order: adminOrderSchema,
  /** Who did each zone: the master of its task; null for a zone in no task. */
  masters: z.array(z.object({ itemId: id, masterName: z.string().nullable() })),
  photos: z.array(workPhotosSchema),
  /** The admin's discount limit, in percent; the owner has none (`discountUnlimited`). */
  discountLimitPct: z.number(),
  discountUnlimited: z.boolean(),
  /** Minutes since the car became ready; null when it is not waiting. */
  waitingMin: z.number().int().nullable(),
  payments: z.array(paymentSchema),
  receipt: receiptSchema.nullable(),
  /** The owner corrects a method chosen by mistake (the amount stays). */
  canCorrectPayments: z.boolean(),
});
export type Handover = z.infer<typeof handoverSchema>;

/** What the client sees of a finished order (design T12): the work's photos and the payment. */
export const orderResultSchema = z.object({
  photos: z.array(workPhotosSchema),
  payments: z.array(z.object({ method: paymentMethodSchema, amount: z.number().int() })),
  receiptNo: z.string().nullable(),
});
export type OrderResult = z.infer<typeof orderResultSchema>;

const discountReason = z
  .string()
  .trim()
  .min(LIMITS.discountReason.min)
  .max(LIMITS.discountReason.max);

const staffReason = z.object({ reasonId: id, note: comment.nullable().optional() });

// ---------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------
// Stage 9: the shop (docs/PLAN.md, sections 7.15, 9.5 and 11)

const availability = z.enum(AVAILABILITIES);
const shopOrderStatus = z.enum(SHOP_ORDER_STATUSES);

export const shopCategorySchema = z.object({
  id,
  parentId: id.nullable(),
  nameUz: z.string(),
  nameRu: z.string(),
});
export type ShopCategory = z.infer<typeof shopCategorySchema>;

/** A product as a client sees it: never the exact stock, only whether there is some (TZ 4.5). */
export const shopProductSchema = z.object({
  id,
  categoryId: id,
  sku: z.string(),
  nameUz: z.string(),
  nameRu: z.string(),
  pack: z.string().nullable(),
  price: z.number().int(),
  availability,
  /** How many the cart may hold: what is free, at most LIMITS.cartQty.max; 0 when out. */
  maxQty: z.number().int(),
  /** The cover photo, a signed link. */
  photo: z.string().nullable(),
});
export type ShopProduct = z.infer<typeof shopProductSchema>;

export const shopProductCardSchema = shopProductSchema.extend({
  photos: z.array(z.string()),
  descriptionUz: z.string().nullable(),
  descriptionRu: z.string().nullable(),
  brand: z.string().nullable(),
});
export type ShopProductCard = z.infer<typeof shopProductCardSchema>;

/** A cart line: the product and how many. */
const cartItem = z.object({
  productId: id,
  qty: z.number().int().min(1).max(LIMITS.cartQty.max),
});
const cartItems = z.array(cartItem).min(1).max(LIMITS.cartLines.max);

/** The cart priced by the server: what can be ordered and what has changed. */
export const shopQuoteSchema = z.object({
  lines: z.array(
    z.object({
      productId: id,
      nameUz: z.string(),
      nameRu: z.string(),
      pack: z.string().nullable(),
      photo: z.string().nullable(),
      price: z.number().int(),
      qty: z.number().int(),
      lineTotal: z.number().int(),
      availability,
      maxQty: z.number().int(),
      /** `gone`: no longer on sale; `short`: less is free than the cart holds. */
      problem: z.enum(['gone', 'short']).nullable(),
    }),
  ),
  subtotal: z.number().int(),
  /** Every line can be ordered as it is. */
  canOrder: z.boolean(),
});
export type ShopQuote = z.infer<typeof shopQuoteSchema>;

const shopOrderItemSchema = z.object({
  productId: id,
  nameUz: z.string(),
  nameRu: z.string(),
  pack: z.string().nullable(),
  price: z.number().int(),
  qty: z.number().int(),
  lineTotal: z.number().int(),
});

/** A shop order as its client sees it (design T9 and the order's own screen). */
export const shopOrderSchema = z.object({
  id,
  number: z.number().int(),
  status: shopOrderStatus,
  fulfillment: z.enum(SHOP_FULFILLMENTS),
  items: z.array(shopOrderItemSchema),
  subtotal: z.number().int(),
  discount: z.number().int(),
  total: z.number().int(),
  comment: z.string().nullable(),
  createdAt: instantSchema,
  /** Gathered: it waits to be picked up until then. */
  pickupUntil: instantSchema.nullable(),
  cancelReason: z.object({ uz: z.string(), ru: z.string() }).nullable(),
  /** Handed over: how it was paid and the receipt. */
  payments: z.array(z.object({ method: paymentMethodSchema, amount: z.number().int() })),
  receiptNo: z.string().nullable(),
  /** What the client may do now: the server decides. */
  canCancel: z.boolean(),
  history: z.array(z.object({ status: shopOrderStatus, at: instantSchema })),
});
export type ShopOrder = z.infer<typeof shopOrderSchema>;

/** A shop order as the staff see it (design A9). */
export const adminShopOrderSchema = shopOrderSchema.extend({
  source: z.enum(SHOP_ORDER_SOURCES),
  client: clientRef.nullable(),
  discountInfo: z
    .object({
      amount: z.number().int(),
      percent: z.number().nullable(),
      reason: z.string().nullable(),
    })
    .nullable(),
  calls: z.array(
    z.object({
      id,
      outcome: z.enum(CALL_OUTCOMES),
      note: z.string().nullable(),
      at: instantSchema,
      adminName: z.string(),
    }),
  ),
  paymentLines: z.array(
    z.object({
      id,
      method: paymentMethodSchema,
      amount: z.number().int(),
      receivedAt: instantSchema,
    }),
  ),
  receipt: z
    .object({ receiptNo: z.string(), amount: z.number().int(), createdAt: instantSchema })
    .nullable(),
  /** While new: the order waits for the call until then. */
  holdUntil: instantSchema.nullable(),
  actions: z.object({
    canCall: z.boolean(),
    canReady: z.boolean(),
    canCancel: z.boolean(),
    canDiscount: z.boolean(),
    canCheckout: z.boolean(),
  }),
  /** The admin's discount limit, for the discount form. */
  discountLimitPct: z.number(),
  discountUnlimited: z.boolean(),
});
export type AdminShopOrder = z.infer<typeof adminShopOrderSchema>;

const shopPayments = z
  .array(z.object({ method: paymentMethodSchema, amount: z.number().int().min(1) }))
  .max(PAYMENT_METHODS.length);
const shopReceiptNo = z.string().trim().min(LIMITS.receiptNo.min).max(LIMITS.receiptNo.max);

export const contract = {
  'tma.bootstrap': { response: bootstrapSchema },
  'tma.saveOnboarding': {
    body: z.object({ lang, fullName, consent: z.literal(true) }),
    response: bootstrapSchema,
  },
  'tma.updateMe': {
    body: z
      .object({
        lang: lang.optional(),
        fullName: fullName.optional(),
        remindersEnabled: z.boolean().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: bootstrapSchema,
  },
  'tma.sharePhone': {
    /** The raw string Telegram returned for the contact request, signature included. */
    body: z.object({ contact: z.string().min(1).max(MAX_CONTACT_LENGTH) }),
    response: bootstrapSchema,
  },

  'client.catalog': { response: clientCatalogSchema },
  'client.cars': { response: z.object({ items: z.array(carSchema) }) },
  'client.createCar': {
    /** A model from the list, or the client's own words and the class they picked ("Other"). */
    body: z.object({
      ...carFields,
      modelId: id.nullable(),
      customModelText: z.string().trim().min(1).max(60).nullable(),
      bodyClass: bodyClass.nullable(),
    }),
    response: carSchema,
  },
  'client.updateCar': {
    params: z.object({ id }),
    body: z
      .object({
        year: carFields.year.optional(),
        plate: carFields.plate.optional(),
        color: carFields.color.optional(),
        modelId: id.nullable().optional(),
        customModelText: z.string().trim().min(1).max(60).nullable().optional(),
        bodyClass: bodyClass.nullable().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: carSchema,
  },
  'client.archiveCar': { params: z.object({ id }), response: done },
  'client.quote': {
    body: z.object({ carId: id, serviceIds: serviceIdList }),
    response: quoteSchema,
  },
  'client.availability': {
    query: z.object({ carId: id, serviceIds: serviceIdsQuery }),
    response: availabilitySchema,
  },
  'client.slots': {
    query: z.object({ carId: id, serviceIds: serviceIdsQuery, date: localDate }),
    response: slotsSchema,
  },
  'client.createOrder': {
    body: z.object({
      /** The client's key for this request: sending it twice gives the same order. */
      requestId: id,
      carId: id,
      serviceIds: serviceIdList,
      startsAt: z.iso.datetime(),
      comment: comment.nullable().optional(),
    }),
    response: orderSchema,
  },
  'client.orders': {
    query: z.object({ tab: z.enum(ORDER_TABS).default('active') }),
    response: orderListSchema,
  },
  'client.order': { params: z.object({ id }), response: orderSchema },
  'client.cancelOrder': {
    params: z.object({ id }),
    body: z.object({ reasonId: id, note: comment.nullable().optional() }),
    response: orderSchema,
  },
  'client.requestReschedule': { params: z.object({ id }), response: orderSchema },

  'tma.requestDeletion': { response: done },

  'admin.today': { response: dashboardSchema },
  'admin.catalog': { response: clientCatalogSchema },
  'admin.cancelReasons': {
    response: z.object({
      items: z.array(
        z.object({
          id,
          nameUz: z.string(),
          nameRu: z.string(),
          requiresText: z.boolean(),
        }),
      ),
    }),
  },
  'admin.orders': {
    query: z.object({
      /** The visits to list: the local dates they start on. Unanswered new orders are always listed. */
      from: localDate.optional(),
      to: localDate.optional(),
      serviceTypeId: id.optional(),
      /** The order number, the client's name or phone, or the plate. */
      q: z.string().trim().min(1).max(60).optional(),
    }),
    response: adminOrderListSchema,
  },
  'admin.order': { params: z.object({ id }), response: adminOrderSchema },
  'admin.createOrder': {
    body: z.object({
      clientId: id,
      carId: id,
      serviceIds: serviceIdList,
      startsAt: z.iso.datetime(),
      source: z.enum(['phone', 'walk_in', 'instagram', 'other']),
      comment: comment.nullable().optional(),
      /** The client confirmed by phone: the order is confirmed at once. */
      confirmedByClient: z.boolean(),
    }),
    response: adminOrderSchema,
  },
  'admin.callOrder': {
    params: z.object({ id }),
    body: z.object({
      outcome: z.enum(CALL_OUTCOMES),
      /** Required for "rejected". */
      reasonId: id.nullable().optional(),
      note: comment.nullable().optional(),
    }),
    response: adminOrderSchema,
  },
  'admin.updateOrderItems': {
    params: z.object({ id }),
    /** The whole list of zones; a price left out is the price list's. */
    body: z.object({
      items: z
        .array(
          z.object({
            serviceId: id,
            price: z.number().int().min(0).max(LIMITS.price.max).nullable().optional(),
            comment: comment.nullable().optional(),
          }),
        )
        .min(1)
        .max(30),
    }),
    response: adminOrderSchema,
  },
  'admin.rescheduleOrder': {
    params: z.object({ id }),
    body: z.object({ startsAt: z.iso.datetime() }),
    response: adminOrderSchema,
  },
  'admin.cancelOrder': {
    params: z.object({ id }),
    body: staffReason,
    response: adminOrderSchema,
  },
  'admin.noShow': { params: z.object({ id }), response: adminOrderSchema },
  'admin.availability': {
    query: z.object({ bodyClass, serviceIds: serviceIdsQuery }),
    response: availabilitySchema,
  },
  'admin.slots': {
    query: z.object({
      bodyClass,
      serviceIds: serviceIdsQuery,
      date: localDate,
      /** Moving an order: its own booking does not block its new time. */
      exceptOrderId: id.optional(),
    }),
    response: slotsSchema,
  },
  /** No date: today. */
  'admin.schedule': { query: z.object({ date: localDate.optional() }), response: scheduleSchema },
  'admin.createBlock': {
    body: z.object({
      boxId: id,
      startsAt: z.iso.datetime(),
      endsAt: z.iso.datetime(),
      note: z.string().trim().min(1).max(LIMITS.note.max),
    }),
    response: z.object({ id }),
  },
  'admin.removeBlock': { params: z.object({ id }), response: done },
  'admin.clients': {
    query: z.object({
      q: z.string().trim().min(1).max(60).optional(),
      filter: z.enum(CLIENT_FILTERS).default('all'),
      cursor: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    response: z.object({ items: z.array(clientSummarySchema), nextCursor: id.nullable() }),
  },
  'admin.createClient': {
    body: z.object({ fullName, phone: z.string().trim().min(1).max(32) }),
    response: clientCardSchema,
  },
  'admin.client': { params: z.object({ id }), response: clientCardSchema },
  'admin.updateClient': {
    params: z.object({ id }),
    body: z
      .object({
        fullName: fullName.optional(),
        phone: z.string().trim().min(1).max(32).optional(),
        /** The admin's own words; null clears them. */
        internalNote: z.string().trim().max(1_000).nullable().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: clientCardSchema,
  },
  'admin.createClientCar': {
    params: z.object({ id }),
    body: z.object({
      ...carFields,
      modelId: id.nullable(),
      customModelText: z.string().trim().min(1).max(60).nullable(),
      bodyClass: bodyClass.nullable(),
    }),
    response: carSchema,
  },
  'admin.anonymizeClient': { params: z.object({ id }), response: clientCardSchema },
  'admin.act': { params: z.object({ id }), response: adminActSchema },
  'admin.saveAct': { params: z.object({ id }), body: actDraftSchema, response: adminActSchema },
  'admin.putActPhoto': {
    params: z.object({ id, mediaId: id }),
    query: z
      .object({ purpose: z.enum(['side', 'defect']), side: z.enum(PHOTO_SIDES).optional() })
      .refine((query) => (query.purpose === 'side') === (query.side !== undefined), {
        message: 'a side photo names its side, a defect photo does not',
        path: ['side'],
      }),
    body: photoBytes,
    response: photoLinkSchema,
  },
  'admin.sendAct': { params: z.object({ id }), response: adminActSchema },
  'admin.confirmActVerbal': { params: z.object({ id }), response: adminActSchema },
  'admin.startWork': { params: z.object({ id }), response: adminOrderSchema },
  'client.act': { params: z.object({ id }), response: clientActSchema },
  'client.confirmAct': { params: z.object({ id }), response: clientActSchema },
  'master.tasks': {
    query: z.object({ tab: z.enum(MASTER_TASK_TABS).default('today') }),
    response: masterTaskListSchema,
  },
  'master.task': { params: z.object({ id }), response: masterTaskSchema },
  'master.startTask': { params: z.object({ id }), response: masterTaskSchema },
  'master.putTaskPhoto': {
    params: z.object({ id, mediaId: id }),
    query: z.object({ kind: z.enum(TASK_PHOTO_KINDS) }),
    body: photoBytes,
    response: photoLinkSchema,
  },
  'master.deleteTaskPhoto': { params: z.object({ id, mediaId: id }), response: done },
  'master.submitTask': {
    params: z.object({ id }),
    body: z.object({ comment: z.string().trim().max(LIMITS.report.max).default('') }),
    response: masterTaskSchema,
  },
  'admin.masters': {
    response: z.object({
      items: z.array(z.object({ id, fullName: z.string(), specialization: z.string().nullable() })),
    }),
  },
  'admin.tasks': {
    query: z.object({ tab: z.enum(ADMIN_TASK_TABS).optional(), orderId: id.optional() }),
    response: adminTaskListSchema,
  },
  'admin.task': { params: z.object({ id }), response: adminTaskSchema },
  'admin.createTask': {
    params: z.object({ id }),
    body: z.object({
      masterId: id,
      assistantId: id.nullable().optional(),
      itemIds: z.array(id).min(1).max(30),
      instruction: z.string().trim().max(LIMITS.instruction.max).default(''),
    }),
    response: adminTaskSchema,
  },
  'admin.updateTask': {
    params: z.object({ id }),
    body: z
      .object({
        masterId: id.optional(),
        assistantId: id.nullable().optional(),
        instruction: z.string().trim().max(LIMITS.instruction.max).optional(),
      })
      .refine(hasChange, atLeastOne),
    response: adminTaskSchema,
  },
  'admin.acceptTask': { params: z.object({ id }), response: adminTaskSchema },
  'admin.reworkTask': {
    params: z.object({ id }),
    body: z.object({ remark: z.string().trim().min(1).max(LIMITS.report.max) }),
    response: adminTaskSchema,
  },
  'admin.addExtraItem': {
    params: z.object({ id }),
    body: z.object({
      serviceId: id,
      /** Left out: the price list's; null: to be agreed. */
      price: z.number().int().min(0).max(LIMITS.price.max).nullable().optional(),
      comment: comment.nullable().optional(),
    }),
    response: adminOrderSchema,
  },
  'admin.decideExtraItem': {
    params: z.object({ id, itemId: id }),
    /** The client answered the admin by phone. */
    body: z.object({ decision: z.enum(['approved', 'rejected']) }),
    response: adminOrderSchema,
  },
  'client.decideExtra': {
    params: z.object({ id, itemId: id }),
    body: z.object({ decision: z.enum(['approve', 'reject']) }),
    response: orderSchema,
  },
  'admin.setDiscount': {
    params: z.object({ id }),
    /** `none` takes the discount off. */
    body: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('percent'),
        percent: z.number().gt(0).max(100).multipleOf(0.01),
        reason: discountReason,
      }),
      z.object({
        kind: z.literal('amount'),
        amount: z.number().int().min(1).max(LIMITS.price.max),
        reason: discountReason,
      }),
      z.object({ kind: z.literal('none') }),
    ]),
    response: adminOrderSchema,
  },
  'admin.priceItem': {
    params: z.object({ id, itemId: id }),
    body: z.object({ price: z.number().int().min(0).max(LIMITS.price.max) }),
    response: adminOrderSchema,
  },
  'admin.handover': { params: z.object({ id }), response: handoverSchema },
  'admin.checkout': {
    params: z.object({ id }),
    body: z.object({
      /** The checkout's key: sent again, it gives the same result. */
      requestId: id,
      /** One line per method; a mixed payment has several. Empty only for a free order. */
      payments: z
        .array(z.object({ method: paymentMethodSchema, amount: z.number().int().min(1) }))
        .max(PAYMENT_METHODS.length),
      receiptNo: z.string().trim().min(LIMITS.receiptNo.min).max(LIMITS.receiptNo.max),
    }),
    response: handoverSchema,
  },
  'admin.correctPayment': {
    params: z.object({ id }),
    body: z.object({ method: paymentMethodSchema }),
    response: handoverSchema,
  },
  'client.orderResult': { params: z.object({ id }), response: orderResultSchema },
  'client.review': {
    params: z.object({ id }),
    body: z.object({
      rating: z.number().int().min(1).max(5),
      /** Words about the work; empty is the same as none. */
      text: z.string().trim().max(LIMITS.reviewText.max).optional(),
    }),
    response: orderSchema,
  },
  'admin.unmappedCars': { response: z.object({ items: z.array(unmappedCarSchema) }) },
  'admin.mapCar': {
    params: z.object({ id }),
    /** The body class comes from the model; the admin may correct it. */
    body: z.object({ modelId: id, bodyClass: bodyClass.optional() }),
    response: carSchema,
  },

  'auth.login': {
    body: z.object({
      login: z.string().trim().min(1).max(64),
      password: z.string().min(1).max(256),
    }),
    response: z.discriminatedUnion('status', [
      z.object({ status: z.literal('signed_in'), me: meSchema }),
      z.object({
        status: z.literal('code_sent'),
        challengeId: id,
        expiresInSec: z.number().int().positive(),
        /** A new code can be asked for (by signing in again) after this many seconds. */
        resendAfterSec: z.number().int().positive(),
      }),
    ]),
  },
  'auth.verifyCode': {
    body: z.object({ challengeId: id, code: z.string().regex(/^\d{6}$/) }),
    response: z.object({ me: meSchema }),
  },
  'auth.logout': { response: z.object({ ok: z.literal(true) }) },
  'auth.me': { response: meSchema },
  'auth.updateMe': { body: z.object({ lang }), response: meSchema },

  'admin.staffList': { response: z.object({ items: z.array(staffSchema) }) },
  'admin.createStaff': {
    body: z.object({
      ...staffFields,
      specialization: staffFields.specialization.optional(),
      login: staffFields.login.optional(),
      password: password.optional(),
    }),
    response: staffSchema,
  },
  'admin.updateStaff': {
    params: z.object({ id }),
    body: z
      .object({
        fullName: staffFields.fullName.optional(),
        phone: staffFields.phone.optional(),
        roles: staffFields.roles.optional(),
        specialization: staffFields.specialization.optional(),
        login: staffFields.login.optional(),
        isBlocked: z.boolean().optional(),
      })
      .refine((body) => Object.values(body).some((value) => value !== undefined), {
        message: 'nothing to change',
      }),
    response: staffSchema,
  },
  'admin.setStaffPassword': {
    params: z.object({ id }),
    body: z.object({ password }),
    response: z.object({ ok: z.literal(true) }),
  },
  'admin.auditLog': {
    query: z.object({
      /** The last id of the previous page. */
      cursor: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    response: z.object({ items: z.array(auditEntrySchema), nextCursor: id.nullable() }),
  },

  'admin.workshop': { response: workshopInfoSchema },
  'admin.settings': { response: settingsSchema },
  'admin.updateSettings': { body: settingsSchema, response: settingsSchema },
  'admin.workHours': { response: workHoursSchema },
  'admin.updateWorkHours': {
    /** The whole week: weekdays that are missing become days off. */
    body: z.object({ days: z.array(workDaySchema).max(7) }),
    response: workHoursSchema,
  },
  'admin.addHoliday': { body: holidaySchema, response: holidaySchema },
  'admin.removeHoliday': { params: z.object({ date: localDate }), response: done },

  'admin.boxes': { response: z.object({ items: z.array(boxSchema) }) },
  'admin.createBox': {
    body: z.object({
      name,
      note: boxNote.optional(),
      serviceTypeIds: z.array(id).max(50),
    }),
    response: boxSchema,
  },
  'admin.updateBox': {
    params: z.object({ id }),
    body: z
      .object({
        name: name.optional(),
        note: boxNote.optional(),
        serviceTypeIds: z.array(id).max(50).optional(),
        isActive: z.boolean().optional(),
        sort: sort.optional(),
      })
      .refine(hasChange, atLeastOne),
    response: boxSchema,
  },

  'admin.brands': { response: z.object({ items: z.array(brandSchema) }) },
  'admin.createBrand': { body: z.object({ name }), response: brandSchema },
  'admin.updateBrand': {
    params: z.object({ id }),
    body: z
      .object({ name: name.optional(), sort: sort.optional(), isActive: z.boolean().optional() })
      .refine(hasChange, atLeastOne),
    response: brandSchema,
  },
  'admin.createModel': {
    body: z.object({ brandId: id, name, bodyClass }),
    response: modelSchema,
  },
  'admin.updateModel': {
    params: z.object({ id }),
    body: z
      .object({
        name: name.optional(),
        bodyClass: bodyClass.optional(),
        sort: sort.optional(),
        isActive: z.boolean().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: modelSchema,
  },

  'admin.serviceTypes': { response: z.object({ items: z.array(serviceTypeSchema) }) },
  'admin.createServiceType': {
    body: z.object({
      code: z
        .string()
        .regex(/^[a-z][a-z0-9_]*$/)
        .min(LIMITS.code.min)
        .max(LIMITS.code.max),
      ...serviceTypeFields,
    }),
    response: serviceTypeSchema,
  },
  'admin.updateServiceType': {
    params: z.object({ id }),
    body: z
      .object({
        nameUz: serviceTypeFields.nameUz.optional(),
        nameRu: serviceTypeFields.nameRu.optional(),
        icon: serviceTypeFields.icon.optional(),
        sort: sort.optional(),
        isActive: z.boolean().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: serviceTypeSchema,
  },
  'admin.prices': { params: z.object({ serviceTypeId: id }), response: priceMatrixSchema },
  'admin.updatePrices': {
    params: z.object({ serviceTypeId: id }),
    /** Every cell of the type at once; a cell that is missing is deleted. */
    body: z.object({
      cells: z.array(priceCellSchema.extend({ serviceId: id })).max(2_000),
    }),
    response: priceMatrixSchema,
  },
  'admin.createService': {
    body: z.object({
      serviceTypeId: id,
      ...serviceFields,
      isCustom: z.boolean().optional(),
    }),
    response: serviceSchema,
  },
  'admin.updateService': {
    params: z.object({ id }),
    body: z
      .object({
        nameUz: serviceFields.nameUz.optional(),
        nameRu: serviceFields.nameRu.optional(),
        group: serviceFields.group.optional(),
        sort: sort.optional(),
        isActive: z.boolean().optional(),
        excludes: z.array(id).max(100).optional(),
      })
      .refine(hasChange, atLeastOne),
    response: serviceSchema,
  },

  // Stage 8: the warehouse
  'admin.stock': {
    query: z.object({
      q: z.string().trim().min(1).max(60).optional(),
      filter: z.enum(STOCK_FILTERS).default('all'),
      categoryId: id.optional(),
    }),
    /** The whole list: one workshop has hundreds of products, not thousands. */
    response: z.object({ items: z.array(stockRowSchema) }),
  },
  'admin.stockMovements': {
    query: z.object({
      productId: id.optional(),
      /** The last id of the previous page. */
      cursor: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    response: z.object({ items: z.array(stockMovementSchema), nextCursor: id.nullable() }),
  },
  'admin.lowStock': { response: z.object({ items: z.array(lowStockItemSchema) }) },
  'admin.stockDocuments': {
    query: z.object({
      kind: z.enum(STOCK_DOCUMENT_KINDS).optional(),
      status: z.enum(STOCK_DOCUMENT_STATUSES).optional(),
      cursor: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    response: z.object({ items: z.array(stockDocumentSummarySchema), nextCursor: id.nullable() }),
  },
  'admin.createStockDocument': {
    body: z.object({ kind: z.enum(MANUAL_DOCUMENT_KINDS), ...stockDocumentFields }),
    response: stockDocumentSchema,
  },
  'admin.stockDocument': { params: z.object({ id }), response: stockDocumentSchema },
  'admin.updateStockDocument': {
    params: z.object({ id }),
    body: z.object(stockDocumentFields),
    response: stockDocumentSchema,
  },
  'admin.deleteStockDocument': { params: z.object({ id }), response: done },
  'admin.postStockDocument': { params: z.object({ id }), response: stockDocumentSchema },
  'admin.putStockInvoicePhoto': {
    params: z.object({ id, mediaId: id }),
    body: photoBytes,
    response: photoLinkSchema,
  },
  'admin.products': { response: z.object({ items: z.array(productSchema) }) },
  'admin.createProduct': { body: z.object(productFields), response: productSchema },
  'admin.updateProduct': {
    params: z.object({ id }),
    body: z
      .object(productFields)
      .partial()
      .extend({ sort: sort.optional(), isActive: z.boolean().optional() })
      .refine(hasChange, atLeastOne),
    response: productSchema,
  },
  'admin.putProductPhoto': {
    params: z.object({ id, mediaId: id }),
    body: photoBytes,
    response: photoLinkSchema,
  },
  'admin.deleteProductPhoto': { params: z.object({ id, mediaId: id }), response: done },
  'admin.productCategories': { response: z.object({ items: z.array(productCategorySchema) }) },
  'admin.createProductCategory': {
    body: z.object({ ...categoryFields, parentId: id.nullable() }),
    response: productCategorySchema,
  },
  'admin.updateProductCategory': {
    params: z.object({ id }),
    body: z
      .object({
        nameUz: name.optional(),
        nameRu: name.optional(),
        sort: sort.optional(),
        isActive: z.boolean().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: productCategorySchema,
  },
  'admin.suppliers': { response: z.object({ items: z.array(supplierSchema) }) },
  'admin.createSupplier': { body: z.object(supplierFields), response: supplierSchema },
  'admin.updateSupplier': {
    params: z.object({ id }),
    body: z
      .object({
        name: name.optional(),
        phone: supplierFields.phone.optional(),
        inn: supplierFields.inn.optional(),
        note: supplierFields.note.optional(),
        isActive: z.boolean().optional(),
      })
      .refine(hasChange, atLeastOne),
    response: supplierSchema,
  },

  // Stage 9: the shop
  'client.shopCategories': { response: z.object({ items: z.array(shopCategorySchema) }) },
  'client.shopProducts': {
    query: z.object({
      categoryId: id.optional(),
      q: z.string().trim().min(1).max(60).optional(),
      inStock: z.enum(['true', 'false']).optional(),
      sort: z.enum(SHOP_SORTS).default('popular'),
    }),
    response: z.object({ items: z.array(shopProductSchema) }),
  },
  'client.shopProduct': { params: z.object({ id }), response: shopProductCardSchema },
  'client.shopQuote': { body: z.object({ items: cartItems }), response: shopQuoteSchema },
  'client.createShopOrder': {
    body: z.object({
      /** The order's key: sent again, it gives the same order. */
      requestId: id,
      items: cartItems,
      comment: z.string().trim().min(1).max(LIMITS.shopComment.max).nullable(),
    }),
    response: shopOrderSchema,
  },
  'client.shopOrders': {
    query: z.object({ tab: z.enum(ORDER_TABS).default('active') }),
    response: z.object({ items: z.array(shopOrderSchema) }),
  },
  'client.shopOrder': { params: z.object({ id }), response: shopOrderSchema },
  'client.cancelShopOrder': {
    params: z.object({ id }),
    body: z.object({ reasonId: id, note: comment.nullable().optional() }),
    response: shopOrderSchema,
  },
  'admin.shopOrders': {
    query: z.object({
      tab: z.enum(SHOP_ORDER_TABS).default('new'),
      q: z.string().trim().min(1).max(60).optional(),
    }),
    response: z.object({ items: z.array(adminShopOrderSchema) }),
  },
  'admin.shopOrder': { params: z.object({ id }), response: adminShopOrderSchema },
  'admin.shopOrderCall': {
    params: z.object({ id }),
    body: z.object({
      outcome: z.enum(CALL_OUTCOMES),
      /** Required when the client refused. */
      reasonId: id.optional(),
      note: comment.nullable().optional(),
    }),
    response: adminShopOrderSchema,
  },
  'admin.shopOrderReady': { params: z.object({ id }), response: adminShopOrderSchema },
  'admin.cancelShopOrder': {
    params: z.object({ id }),
    body: z.object({ reasonId: id, note: comment.nullable().optional() }),
    response: adminShopOrderSchema,
  },
  'admin.setShopDiscount': {
    params: z.object({ id }),
    body: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('percent'),
        percent: z.number().gt(0).max(100).multipleOf(0.01),
        reason: discountReason,
      }),
      z.object({
        kind: z.literal('amount'),
        amount: z.number().int().min(1).max(LIMITS.price.max),
        reason: discountReason,
      }),
      z.object({ kind: z.literal('none') }),
    ]),
    response: adminShopOrderSchema,
  },
  'admin.shopCheckout': {
    params: z.object({ id }),
    body: z.object({ requestId: id, payments: shopPayments, receiptNo: shopReceiptNo }),
    response: adminShopOrderSchema,
  },
  'admin.quickSale': {
    body: z.object({
      requestId: id,
      clientId: id.nullable(),
      items: cartItems,
      payments: shopPayments,
      receiptNo: shopReceiptNo,
    }),
    response: adminShopOrderSchema,
  },
  /** Goods on sale for the counter: the staff see the free stock itself. */
  'admin.saleProducts': {
    response: z.object({
      items: z.array(shopProductSchema.extend({ free: z.number() })),
    }),
  },
} as const satisfies Record<RouteName, EndpointSchemas>;

export interface EndpointSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

type Contract = typeof contract;
type RequestField = 'params' | 'query' | 'body';

type FieldOf<
  K extends RouteName,
  F extends RequestField,
  Mode extends 'input' | 'output',
> = F extends keyof Contract[K]
  ? Contract[K][F] extends z.ZodType
    ? Mode extends 'input'
      ? z.input<Contract[K][F]>
      : z.output<Contract[K][F]>
    : never
  : never;

type RequestShape<K extends RouteName, Mode extends 'input' | 'output'> = {
  [F in RequestField as [FieldOf<K, F, Mode>] extends [never] ? never : F]: FieldOf<K, F, Mode>;
};

/** What a client sends: only the fields this endpoint declares, before defaults apply. */
export type RequestOf<K extends RouteName> = RequestShape<K, 'input'>;

/** What a handler receives: the same fields after validation, defaults and coercion. */
export type ParsedRequestOf<K extends RouteName> = RequestShape<K, 'output'>;

export type ResponseOf<K extends RouteName> = z.infer<Contract[K]['response']>;
