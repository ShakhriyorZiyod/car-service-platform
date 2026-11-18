import { z } from 'zod';
import { LANGS } from '../i18n';
import type { RouteName } from '../routes';
import {
  API_ERROR_CODES,
  LIMITS,
  MAX_CONTACT_LENGTH,
  PERMISSIONS,
  ROLES,
  SHELLS,
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

/** The first answer of every visit: who the user is and which part of the app to open. */
export const bootstrapSchema = z.object({
  user: z.object({
    id,
    fullName: z.string(),
    lang,
    /** Verified by Telegram; null until the user shares it. */
    phone: z.string().nullable(),
    consentGiven: z.boolean(),
  }),
  shell: z.enum(SHELLS),
  roles: z.array(role),
  links: z.object({
    /** The web panel, for the staff part; null until PUBLIC_URL is set. */
    admin: z.string().nullable(),
  }),
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

export const contract = {
  'tma.bootstrap': { response: bootstrapSchema },
  'tma.saveOnboarding': {
    body: z.object({ lang, fullName, consent: z.literal(true) }),
    response: bootstrapSchema,
  },
  'tma.updateMe': { body: z.object({ lang }), response: bootstrapSchema },
  'tma.sharePhone': {
    /** The raw string Telegram returned for the contact request, signature included. */
    body: z.object({ contact: z.string().min(1).max(MAX_CONTACT_LENGTH) }),
    response: bootstrapSchema,
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
