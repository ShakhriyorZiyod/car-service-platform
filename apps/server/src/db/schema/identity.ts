import { LANGS } from '@cs/shared/i18n';
import { ROLES } from '@cs/shared/vocabulary';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, idColumn, instant, updatedAt } from './columns';

/** Tables of the identity module (docs/PLAN.md, section 7.2). Only this module writes them. */

export const langEnum = pgEnum('lang', LANGS);
export const botAccessEnum = pgEnum('bot_access', ['unknown', 'allowed', 'blocked']);
export const roleEnum = pgEnum('role', ROLES);

/** Every person: client and staff alike. */
export const users = pgTable(
  'users',
  {
    id: idColumn(),
    /** Null for a client the admin entered by phone, or staff who has not opened the bot yet. */
    telegramId: bigint({ mode: 'number' }).unique(),
    /** +998XXXXXXXXX. Links accounts only when Telegram verified it (phoneVerified). */
    phone: text().unique(),
    phoneVerified: boolean().notNull().default(false),
    fullName: text().notNull(),
    lang: langEnum().notNull().default('uz'),
    botAccess: botAccessEnum().notNull().default('unknown'),
    consentVersion: text(),
    consentAt: instant(),
    /** Lower-case; only for staff who sign in to the panel. */
    login: text().unique(),
    /** Argon2id. */
    passwordHash: text(),
    specialization: text(),
    /** Staff access switched off; their roles stay for the history but do nothing. */
    isBlocked: boolean().notNull().default(false),
    lastSeenAt: instant(),
    createdBy: uuid().references((): AnyPgColumn => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('users_verified_phone_exists', sql`not ${t.phoneVerified} or ${t.phone} is not null`),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum().notNull(),
    grantedBy: uuid().references(() => users.id),
    grantedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/** Panel sessions. The id is the SHA-256 of the cookie's token, so a database leak is no key. */
export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: instant().notNull(),
    expiresAt: instant().notNull(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** The second step of signing in: a code sent by the bot. */
export const loginChallenges = pgTable(
  'login_challenges',
  {
    id: idColumn(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text().notNull(),
    createdAt: instant().notNull(),
    expiresAt: instant().notNull(),
    attempts: integer().notNull().default(0),
    consumedAt: instant(),
  },
  (t) => [index('login_challenges_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Wrong passwords, to pause signing in after too many (TZ 15.2). `subject` is `user:<id>` when the
 * login or phone belongs to someone, so both ways of signing in share one count; otherwise it is
 * what was typed.
 */
export const loginFailures = pgTable(
  'login_failures',
  {
    id: idColumn(),
    subject: text().notNull(),
    ip: text(),
    at: instant().notNull(),
  },
  (t) => [index('login_failures_subject_at_idx').on(t.subject, t.at)],
);
