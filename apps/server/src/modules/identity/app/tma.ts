import type { Bootstrap } from '@cs/shared';
import { langFromCode, type Lang } from '@cs/shared/i18n';
import { LIMITS } from '@cs/shared/vocabulary';
import { eq, isNull, lt, or } from 'drizzle-orm';
import { users } from '../../../db/schema';
import type { TmaActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import { CURRENT_POLICY_VERSION } from '../domain/consent';
import { decidePhoneLink } from '../domain/phone-link';
import { effectiveRoles, shellOf } from '../domain/roles';
import { readContact, readInitData, type TelegramUser } from '../domain/telegram-data';
import { rolesOf, violatedUniqueConstraint } from './users';

/**
 * The Mini App side of identity (docs/PLAN.md, sections 4.7 and 7.2): who opened the app, which
 * part of it they get, their consent and their Telegram-verified phone number.
 */

export interface TmaServiceDeps extends PlatformDeps {
  botToken: string;
  /** How old init data may be: a day in production (TZ 15.2). */
  initDataMaxAgeSeconds: number;
  /** The web panel, shown to staff in the Mini App; null until PUBLIC_URL is set. */
  adminUrl: string | null;
}

export interface TmaService {
  /** The actor of signed init data, creating the user on their first visit; null if not valid. */
  authenticate(rawInitData: string): Promise<TmaActor | null>;
  bootstrap(actor: TmaActor): Promise<Bootstrap>;
  saveOnboarding(actor: TmaActor, input: { lang: Lang; fullName: string }): Promise<Bootstrap>;
  setLang(actor: TmaActor, lang: Lang): Promise<Bootstrap>;
  /** Links the Telegram-verified number in `rawContact` to this person (section 7.2). */
  sharePhone(actor: TmaActor, rawContact: string): Promise<Bootstrap>;
  /** /start in the bot: the person exists and the bot may write to them. Returns their language. */
  recordBotStart(user: TelegramUser): Promise<Lang>;
  setBotAccess(telegramId: number, access: 'allowed' | 'blocked'): Promise<void>;
}

/** A shared contact is used right away; an old one is not accepted. */
const CONTACT_MAX_AGE_SECONDS = 3600;
/** Writing the last-seen time on every request would cost a write per request for nothing. */
const TOUCH_MS = 5 * 60_000;

const nameOf = (user: TelegramUser): string =>
  [user.firstName, user.lastName].filter(Boolean).join(' ').trim().slice(0, LIMITS.fullName.max) ||
  'Telegram';

export function createTmaService(deps: TmaServiceDeps): TmaService {
  const { db, clock } = deps;

  /** The row of a Telegram account, created on first sight. */
  async function upsertTelegramUser(user: TelegramUser, botAccess?: 'allowed') {
    const now = clock.now();
    await db
      .insert(users)
      .values({
        telegramId: user.telegramId,
        fullName: nameOf(user),
        lang: langFromCode(user.languageCode),
        lastSeenAt: now,
        ...(botAccess && { botAccess }),
      })
      .onConflictDoUpdate({
        target: users.telegramId,
        set: { lastSeenAt: now, ...(botAccess && { botAccess }) },
        setWhere: botAccess
          ? undefined
          : or(isNull(users.lastSeenAt), lt(users.lastSeenAt, new Date(now.getTime() - TOUCH_MS))),
      });
    const [row] = await db
      .select({ id: users.id, lang: users.lang, isBlocked: users.isBlocked })
      .from(users)
      .where(eq(users.telegramId, user.telegramId));
    if (!row) throw new Error('the Telegram user row is missing right after the upsert');
    return row;
  }

  async function actorOf(telegramId: number): Promise<TmaActor> {
    const [row] = await db
      .select({ id: users.id, isBlocked: users.isBlocked })
      .from(users)
      .where(eq(users.telegramId, telegramId));
    if (!row) throw new AppError('unauthorized', 'the Telegram account has no user');
    return {
      kind: 'tma',
      userId: row.id,
      telegramId,
      roles: effectiveRoles(await rolesOf(db, row.id), row.isBlocked),
    };
  }

  async function bootstrapOf(telegramId: number): Promise<Bootstrap> {
    const actor = await actorOf(telegramId);
    const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
    if (!user) throw new AppError('not_found');
    return {
      user: {
        id: user.id,
        fullName: user.fullName,
        lang: user.lang,
        phone: user.phoneVerified ? user.phone : null,
        consentGiven: user.consentVersion !== null,
      },
      shell: shellOf(actor.roles),
      roles: [...actor.roles],
      links: { admin: actor.roles.length > 0 ? deps.adminUrl : null },
    };
  }

  return {
    async authenticate(rawInitData) {
      const initData = readInitData(rawInitData, {
        botToken: deps.botToken,
        now: clock.now(),
        maxAgeSeconds: deps.initDataMaxAgeSeconds,
      });
      if (!initData.ok) return null;
      const row = await upsertTelegramUser(initData.user);
      return {
        kind: 'tma',
        userId: row.id,
        telegramId: initData.user.telegramId,
        roles: effectiveRoles(await rolesOf(db, row.id), row.isBlocked),
      };
    },

    bootstrap: (actor) => bootstrapOf(actor.telegramId),

    async saveOnboarding(actor, input) {
      await db
        .update(users)
        .set({
          lang: input.lang,
          fullName: input.fullName,
          consentVersion: CURRENT_POLICY_VERSION,
          consentAt: clock.now(),
        })
        .where(eq(users.id, actor.userId));
      return bootstrapOf(actor.telegramId);
    },

    async setLang(actor, lang) {
      await db.update(users).set({ lang }).where(eq(users.id, actor.userId));
      return bootstrapOf(actor.telegramId);
    },

    async sharePhone(actor, rawContact) {
      const now = clock.now();
      const contact = readContact(rawContact, {
        botToken: deps.botToken,
        now,
        maxAgeSeconds: CONTACT_MAX_AGE_SECONDS,
        telegramId: actor.telegramId,
      });
      if (!contact.ok) throw new AppError('invalid_contact', contact.reason);
      const { phone } = contact;

      try {
        await db.transaction(async (tx) => {
          const [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, actor.userId))
            .for('update');
          if (!user) throw new AppError('not_found');
          if (!user.consentVersion) throw new AppError('consent_required');

          // Locked and read after the lock: a concurrent link of the same number is seen here.
          const [holder] = await tx
            .select({ id: users.id, telegramId: users.telegramId })
            .from(users)
            .where(eq(users.phone, phone))
            .for('update');

          const decision = decidePhoneLink(user, holder ?? null, phone);
          switch (decision.kind) {
            case 'unchanged':
              await tx.update(users).set({ phoneVerified: true }).where(eq(users.id, user.id));
              return;
            case 'set':
              await tx
                .update(users)
                .set({ phone, phoneVerified: true })
                .where(eq(users.id, user.id));
              return;
            case 'merge':
              // The fresh row goes first, which frees its Telegram id for the row that stays.
              await tx.delete(users).where(eq(users.id, user.id));
              await tx
                .update(users)
                .set({
                  telegramId: actor.telegramId,
                  phoneVerified: true,
                  lang: user.lang,
                  consentVersion: user.consentVersion,
                  consentAt: user.consentAt,
                  botAccess: user.botAccess,
                  lastSeenAt: now,
                })
                .where(eq(users.id, decision.intoUserId));
              return;
            case 'taken':
              throw new AppError('phone_taken');
          }
        });
      } catch (error) {
        // Two people setting the same free number at once: the second one loses here.
        if (violatedUniqueConstraint(error) === 'users_phone_unique') {
          throw new AppError('phone_taken');
        }
        throw error;
      }
      return bootstrapOf(actor.telegramId);
    },

    async recordBotStart(user) {
      const row = await upsertTelegramUser(user, 'allowed');
      return row.lang;
    },

    async setBotAccess(telegramId, access) {
      await db.update(users).set({ botAccess: access }).where(eq(users.telegramId, telegramId));
    },
  };
}
