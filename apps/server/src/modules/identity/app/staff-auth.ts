import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Me } from '@cs/shared';
import type { Lang } from '@cs/shared/i18n';
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { loginChallenges, loginFailures, sessions, users } from '../../../db/schema';
import { newId } from '../../../lib/ids';
import type { StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import { parseIdentifier } from '../domain/credentials';
import { canUsePanel, effectiveRoles, needsSecondFactor, permissionsOf } from '../domain/roles';
import {
  challengeExpiry,
  challengeState,
  failureWindowStart,
  isSessionAlive,
  isSignInLocked,
  resendWaitSeconds,
  sessionExpiry,
  shouldTouchSession,
  SIGN_IN_RULES,
} from '../domain/sign-in';
import { verifyPassword } from './passwords';
import type { LoginCodeSender } from './ports';
import { rolesOf } from './users';

/**
 * Signing in to the web panel (docs/PLAN.md, sections 8 and 15): login or phone and a password,
 * then for directors and owners a code from the bot; the result is a session cookie.
 */

export interface StaffAuthDeps extends PlatformDeps {
  loginCodes: LoginCodeSender;
}

interface RequestInfo {
  ip: string;
  userAgent: string | null;
}

export type SignInResult =
  | { kind: 'signed_in'; token: string; me: Me }
  | { kind: 'code_sent'; challengeId: string; expiresInSec: number; resendAfterSec: number };

export interface StaffAuthService {
  signIn(input: { identifier: string; password: string } & RequestInfo): Promise<SignInResult>;
  verifyCode(input: { challengeId: string; code: string } & RequestInfo): Promise<{
    token: string;
    me: Me;
  }>;
  /** The actor of a session cookie; null when it is unknown, expired or no longer allowed. */
  authenticate(token: string): Promise<StaffActor | null>;
  signOut(token: string): Promise<void>;
  me(actor: StaffActor): Promise<Me>;
  setLang(actor: StaffActor, lang: Lang): Promise<Me>;
}

/** The cookie holds the token; the database only its hash. */
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Bound to its challenge, so a code means nothing for another one. */
const hashCode = (challengeId: string, code: string): Buffer =>
  createHash('sha256').update(`${challengeId}:${code}`).digest();

const newCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0');

export function createStaffAuthService(deps: StaffAuthDeps): StaffAuthService {
  const { db, clock } = deps;

  async function findUser(input: string) {
    const identifier = parseIdentifier(input);
    if (!identifier) return undefined;
    const where =
      identifier.kind === 'login'
        ? eq(users.login, identifier.login)
        : eq(users.phone, identifier.phone);
    const [user] = await db.select().from(users).where(where);
    return user;
  }

  async function meOf(userId: string, roles: StaffActor['roles']): Promise<Me> {
    const [user] = await db
      .select({ fullName: users.fullName, lang: users.lang })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new AppError('unauthorized');
    return { id: userId, ...user, roles: [...roles], permissions: permissionsOf(roles) };
  }

  /** The user's roles, provided they may use the panel right now. */
  async function panelRoles(user: { id: string; isBlocked: boolean }) {
    const roles = effectiveRoles(await rolesOf(db, user.id), user.isBlocked);
    if (!canUsePanel(roles)) throw new AppError('forbidden', 'no panel access');
    return roles;
  }

  async function startSession(
    userId: string,
    roles: StaffActor['roles'],
    request: RequestInfo,
  ): Promise<{ token: string; me: Me }> {
    const now = clock.now();
    const token = randomBytes(32).toString('base64url');
    await db.insert(sessions).values({
      id: hashToken(token),
      userId,
      lastSeenAt: now,
      expiresAt: sessionExpiry(now),
      ip: request.ip,
      userAgent: request.userAgent?.slice(0, 300) ?? null,
    });
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, userId));
    return { token, me: await meOf(userId, roles) };
  }

  async function sendCode(user: { id: string; telegramId: number | null; lang: Lang }) {
    if (user.telegramId === null) {
      throw new AppError('two_factor_unavailable', 'the account is not linked to Telegram');
    }
    const now = clock.now();
    const [last] = await db
      .select({ createdAt: loginChallenges.createdAt })
      .from(loginChallenges)
      .where(eq(loginChallenges.userId, user.id))
      .orderBy(desc(loginChallenges.createdAt))
      .limit(1);
    if (resendWaitSeconds(last?.createdAt ?? null, now) > 0) {
      throw new AppError('rate_limited', 'a code was sent less than a minute ago');
    }

    const challengeId = newId();
    const code = newCode();
    await db.transaction(async (tx) => {
      // Only the newest code works.
      await tx
        .update(loginChallenges)
        .set({ consumedAt: now })
        .where(and(eq(loginChallenges.userId, user.id), isNull(loginChallenges.consumedAt)));
      await tx.insert(loginChallenges).values({
        id: challengeId,
        userId: user.id,
        codeHash: hashCode(challengeId, code).toString('hex'),
        createdAt: now,
        expiresAt: challengeExpiry(now),
      });
    });

    let delivery: 'sent' | 'unreachable';
    try {
      delivery = await deps.loginCodes.send({ telegramId: user.telegramId, lang: user.lang }, code);
    } catch (error) {
      // The code never left; it must not hold back the next attempt for a minute.
      await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
      throw error;
    }
    if (delivery === 'unreachable') {
      await db.delete(loginChallenges).where(eq(loginChallenges.id, challengeId));
      await db.update(users).set({ botAccess: 'blocked' }).where(eq(users.id, user.id));
      throw new AppError('two_factor_unavailable', 'the bot cannot write to this account');
    }

    return {
      kind: 'code_sent' as const,
      challengeId,
      expiresInSec: SIGN_IN_RULES.codeTtlMs / 1000,
      resendAfterSec: SIGN_IN_RULES.codeResendMs / 1000,
    };
  }

  return {
    async signIn(input) {
      const now = clock.now();
      const user = await findUser(input.identifier);
      // Both ways of signing in (login, phone) of one person share one count.
      const subject = user ? `user:${user.id}` : `typed:${input.identifier.trim().toLowerCase()}`;

      const [failures] = await db
        .select({ n: count() })
        .from(loginFailures)
        .where(
          and(eq(loginFailures.subject, subject), gt(loginFailures.at, failureWindowStart(now))),
        );
      if (isSignInLocked(failures?.n ?? 0)) throw new AppError('login_locked');

      const passwordOk = await verifyPassword(user?.passwordHash ?? null, input.password);
      if (!user || !passwordOk) {
        await db.insert(loginFailures).values({ subject, ip: input.ip, at: now });
        throw new AppError('invalid_credentials');
      }
      await db.delete(loginFailures).where(eq(loginFailures.subject, subject));

      const roles = await panelRoles(user);
      if (needsSecondFactor(roles)) return sendCode(user);
      return { kind: 'signed_in', ...(await startSession(user.id, roles, input)) };
    },

    async verifyCode(input) {
      const now = clock.now();
      // Decided inside the transaction, thrown after it: a failed try must still be counted.
      const outcome = await db.transaction(async (tx) => {
        const [challenge] = await tx
          .select()
          .from(loginChallenges)
          .where(eq(loginChallenges.id, input.challengeId))
          .for('update');
        if (!challenge || challengeState(challenge, now) !== 'active') return 'expired' as const;

        const expected = Buffer.from(challenge.codeHash, 'hex');
        if (!timingSafeEqual(expected, hashCode(challenge.id, input.code))) {
          const attempts = challenge.attempts + 1;
          await tx
            .update(loginChallenges)
            .set({ attempts })
            .where(eq(loginChallenges.id, challenge.id));
          return attempts >= SIGN_IN_RULES.codeMaxAttempts
            ? ('expired' as const)
            : ('wrong' as const);
        }

        await tx
          .update(loginChallenges)
          .set({ consumedAt: now })
          .where(eq(loginChallenges.id, challenge.id));
        return { userId: challenge.userId };
      });

      if (outcome === 'wrong') throw new AppError('invalid_code');
      if (outcome === 'expired') throw new AppError('code_expired');

      const [user] = await db
        .select({ id: users.id, isBlocked: users.isBlocked })
        .from(users)
        .where(eq(users.id, outcome.userId));
      if (!user) throw new AppError('code_expired');
      return startSession(user.id, await panelRoles(user), input);
    },

    async authenticate(token) {
      const now = clock.now();
      const id = hashToken(token);
      const [row] = await db
        .select({
          userId: sessions.userId,
          lastSeenAt: sessions.lastSeenAt,
          expiresAt: sessions.expiresAt,
          isBlocked: users.isBlocked,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, id));
      if (!row) return null;

      const roles = effectiveRoles(await rolesOf(db, row.userId), row.isBlocked);
      if (!isSessionAlive(row, now) || !canUsePanel(roles)) {
        await db.delete(sessions).where(eq(sessions.id, id));
        return null;
      }
      if (shouldTouchSession(row.lastSeenAt, now)) {
        await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, id));
        await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.userId));
      }
      return {
        kind: 'staff',
        userId: row.userId,
        roles,
        permissions: new Set(permissionsOf(roles)),
      };
    },

    async signOut(token) {
      await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
    },

    me: (actor) => meOf(actor.userId, actor.roles),

    async setLang(actor, lang) {
      await db.update(users).set({ lang }).where(eq(users.id, actor.userId));
      return meOf(actor.userId, actor.roles);
    },
  };
}
