import { eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { outbox, users } from '../db/schema';
import type { Logger } from '../logger';
import { renderNotification } from '../notifications/render';
import { outboxPayloadSchema, type RenderedMessage } from '../notifications/types';
import type { Clock } from '../platform/clock';

/** Sends one rendered message to one Telegram chat (bot/delivery.ts). */
export interface MessageSender {
  /** `unreachable`: Telegram refuses this chat (blocked the bot, never opened it). */
  send(chatId: number, message: RenderedMessage): Promise<'sent' | 'unreachable'>;
}

const BATCH_SIZE = 20;
/** A row that was taken but not finished (the process stopped) is tried again after this. */
const CLAIM_MS = 2 * 60_000;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;
const MAX_ATTEMPTS = 8;

type ClaimedRow = {
  id: string;
  recipient_id: string;
  payload: unknown;
  attempts: number;
};

/**
 * Delivers what the outbox holds (docs/PLAN.md, section 4.8): retries with growing pauses, gives up
 * after a number of tries, and notes the people Telegram cannot reach.
 */
export function createOutboxWorker(deps: {
  db: Db;
  clock: Clock;
  logger: Logger;
  sender: MessageSender;
  /** Called when Telegram says this person cannot be written to. */
  markUnreachable(telegramId: number): Promise<void>;
}) {
  const { db, clock, logger, sender } = deps;

  async function claim(now: Date): Promise<ClaimedRow[]> {
    const until = new Date(now.getTime() + CLAIM_MS);
    const result = await db.execute<ClaimedRow>(sql`
      update outbox set next_attempt_at = ${until}
      where id in (
        select id from outbox
        where status = 'pending' and next_attempt_at <= ${now}
        order by created_at
        limit ${BATCH_SIZE}
        for update skip locked
      )
      returning id, recipient_id, payload, attempts
    `);
    return result.rows;
  }

  async function finish(id: string, change: Partial<typeof outbox.$inferInsert>) {
    await db.update(outbox).set(change).where(eq(outbox.id, id));
  }

  async function deliver(row: ClaimedRow): Promise<void> {
    const now = clock.now();
    const payload = outboxPayloadSchema.safeParse(row.payload);
    if (!payload.success) {
      await finish(row.id, { status: 'dead', lastError: 'payload does not match its schema' });
      return;
    }
    const [user] = await db
      .select({ telegramId: users.telegramId })
      .from(users)
      .where(eq(users.id, row.recipient_id));
    if (!user || user.telegramId === null) {
      // A client the admin entered by phone has no Telegram: nobody to tell, and it is no error.
      await finish(row.id, { status: 'skipped', lastError: 'no Telegram account' });
      return;
    }

    try {
      const message = renderNotification(payload.data.notification, payload.data.lang);
      const outcome = await sender.send(user.telegramId, message);
      if (outcome === 'unreachable') {
        await deps.markUnreachable(user.telegramId);
        await finish(row.id, {
          status: 'skipped',
          lastError: 'chat is unreachable',
          attempts: row.attempts + 1,
        });
        return;
      }
      await finish(row.id, {
        status: 'sent',
        sentAt: now,
        attempts: row.attempts + 1,
        lastError: null,
      });
    } catch (err) {
      const attempts = row.attempts + 1;
      // Never the message text: it holds names and phone numbers.
      const description = err instanceof Error ? err.name : 'unknown error';
      logger.warn({ outboxId: row.id, attempts, error: description }, 'message delivery failed');
      await finish(
        row.id,
        attempts >= MAX_ATTEMPTS
          ? { status: 'dead', attempts, lastError: description }
          : {
              attempts,
              lastError: description,
              nextAttemptAt: new Date(
                now.getTime() + Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS),
              ),
            },
      );
    }
  }

  return {
    /** One pass over what is due; returns how many messages it handled. */
    async runOnce(): Promise<number> {
      const rows = await claim(clock.now());
      for (const row of rows) await deliver(row);
      return rows.length;
    },
  };
}
