import type { Lang } from '@cs/shared/i18n';
import type { DbOrTx } from '../db/client';
import { eq } from 'drizzle-orm';
import { outbox, users } from '../db/schema';
import type { Notification } from '../notifications/types';
import type { Clock } from './clock';

/**
 * Messages to other people (docs/PLAN.md, section 4.8): written in the transaction of the change
 * they report, so a message exists exactly when the change does. The outbox worker delivers them.
 */

export interface OutboxMessage {
  to: { userId: string; lang: Lang };
  notification: Notification;
  /** The same key is written once: repeating the whole use case does not message twice. */
  dedupeKey?: string;
}

export interface Outbox {
  enqueue(tx: DbOrTx, message: OutboxMessage): Promise<void>;
  /**
   * Tells one person, in their language, if they can be written to in Telegram: a client entered
   * by phone has no Telegram, and that is no error.
   */
  tell(tx: DbOrTx, userId: string, notification: Notification, dedupeKey?: string): Promise<void>;
}

export function createOutbox(deps: { clock: Clock }): Outbox {
  const outboxService: Outbox = {
    async enqueue(tx, message) {
      const now = deps.clock.now();
      await tx
        .insert(outbox)
        .values({
          recipientId: message.to.userId,
          payload: { lang: message.to.lang, notification: message.notification },
          dedupeKey: message.dedupeKey ?? null,
          nextAttemptAt: now,
        })
        .onConflictDoNothing();
    },

    async tell(tx, userId, notification, dedupeKey) {
      const [user] = await tx
        .select({ lang: users.lang, telegramId: users.telegramId })
        .from(users)
        .where(eq(users.id, userId));
      if (!user || user.telegramId === null) return;
      await outboxService.enqueue(tx, {
        to: { userId, lang: user.lang },
        notification,
        ...(dedupeKey !== undefined && { dedupeKey }),
      });
    },
  };
  return outboxService;
}
