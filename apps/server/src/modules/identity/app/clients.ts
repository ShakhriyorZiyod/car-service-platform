import { normalizePhone } from '@cs/shared/format';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx, Tx } from '../../../db/client';
import { userRoles, users } from '../../../db/schema';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { Outbox } from '../../../platform/outbox';
import type { StaffDirectory } from '../../../platform/ports';
import type { TmaActor } from '../../../platform/actors';
import { violatedUniqueConstraint } from './users';

/**
 * The people who are clients, as the staff keep them (docs/PLAN.md, sections 7.2 and 15; design
 * A10). A client the admin enters by phone has no Telegram until they open the bot and share the
 * same number.
 */

export interface ClientsWriterDeps extends PlatformDeps {
  outbox: Outbox;
  staff: StaffDirectory;
}

export interface ClientRecord {
  id: string;
  fullName: string;
  phone: string | null;
  phoneVerified: boolean;
  internalNote: string | null;
}

export interface ClientPatch {
  fullName?: string | undefined;
  phone?: string | undefined;
  internalNote?: string | null | undefined;
}

export interface ClientsWriter {
  create(input: { fullName: string; phone: string; createdBy: string }): Promise<ClientRecord>;
  /** A client, never a staff member and never an erased one; otherwise `not_found`. */
  get(id: string): Promise<ClientRecord>;
  update(id: string, patch: ClientPatch): Promise<ClientRecord>;
  /**
   * Erases name, phone, Telegram link and note, inside the caller's transaction (TZ 15.3). The row
   * stays, so orders and payments keep their client.
   */
  anonymize(tx: Tx, id: string): Promise<void>;
  /** The client asks for their data to be erased; the owner is told (once) and decides. */
  requestDeletion(actor: TmaActor): Promise<void>;
}

export const ANONYMOUS_NAME = 'Anonim';

export function createClientsWriter(deps: ClientsWriterDeps): ClientsWriter {
  const { db, clock, outbox, staff } = deps;

  async function clientRow(from: DbOrTx, id: string) {
    const [row] = await from.select().from(users).where(eq(users.id, id));
    if (!row || row.anonymizedAt !== null) throw new AppError('not_found');
    const roles = await from
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, id))
      .limit(1);
    if (roles.length > 0 || row.login !== null) throw new AppError('not_found');
    return row;
  }

  const record = (row: typeof users.$inferSelect): ClientRecord => ({
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    phoneVerified: row.phoneVerified,
    internalNote: row.internalNote,
  });

  function parsePhone(input: string): string {
    const phone = normalizePhone(input);
    if (!phone) throw invalidAt('body.phone', 'not a phone number');
    return phone;
  }

  function rethrow(error: unknown): never {
    if (violatedUniqueConstraint(error) === 'users_phone_unique') throw new AppError('phone_taken');
    throw error;
  }

  return {
    async create(input) {
      const phone = parsePhone(input.phone);
      try {
        const [row] = await db
          .insert(users)
          .values({
            fullName: input.fullName,
            phone,
            phoneVerified: false,
            createdBy: input.createdBy,
            createdAt: clock.now(),
          })
          .returning();
        if (!row) throw new Error('insert returned no row');
        return record(row);
      } catch (error) {
        rethrow(error);
      }
    },

    async get(id) {
      return record(await clientRow(db, id));
    },

    async update(id, patch) {
      const row = await clientRow(db, id);
      let phone = row.phone;
      if (patch.phone !== undefined && parsePhone(patch.phone) !== row.phone) {
        // Telegram verified this number: it is what links the account, and only the person changes it.
        if (row.phoneVerified) throw invalidAt('body.phone', 'the number is verified by Telegram');
        phone = parsePhone(patch.phone);
      }
      try {
        await db
          .update(users)
          .set({
            fullName: patch.fullName ?? row.fullName,
            phone,
            internalNote:
              patch.internalNote === undefined
                ? row.internalNote
                : patch.internalNote?.trim() || null,
            updatedAt: clock.now(),
          })
          .where(eq(users.id, id));
      } catch (error) {
        rethrow(error);
      }
      return record(await clientRow(db, id));
    },

    async anonymize(tx, id) {
      await clientRow(tx, id);
      await tx
        .update(users)
        .set({
          fullName: ANONYMOUS_NAME,
          phone: null,
          phoneVerified: false,
          telegramId: null,
          botAccess: 'unknown',
          internalNote: null,
          anonymizedAt: clock.now(),
          updatedAt: clock.now(),
        })
        .where(eq(users.id, id));
    },

    async requestDeletion(actor) {
      const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
      if (!user || user.anonymizedAt !== null) throw new AppError('not_found');
      await db.transaction(async (tx) => {
        // Only the first request counts, and only the first one writes to the owner.
        const [marked] = await tx
          .update(users)
          .set({ deletionRequestedAt: clock.now() })
          .where(and(eq(users.id, actor.userId), isNull(users.deletionRequestedAt)))
          .returning({ id: users.id });
        if (!marked) return;
        for (const owner of await staff.recipients(tx, ['owner'])) {
          await outbox.enqueue(tx, {
            to: owner,
            notification: {
              type: 'staff.deletion_requested',
              clientId: user.id,
              clientName: user.fullName,
            },
            dedupeKey: `deletion:${user.id}:${owner.userId}`,
          });
        }
      });
    },
  };
}
