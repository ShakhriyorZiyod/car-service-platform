import { settingsSchema, type Settings, type WorkshopInfo } from '@cs/shared';
import { normalizePhone } from '@cs/shared/format';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { settings } from '../../../db/schema';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import type { AuditService } from '../../audit';
import { normalizeRules, readSettings } from '../domain/settings';

/** The workshop's own data and rules (docs/PLAN.md, section 7.4). Written by the owner only. */

export interface SettingsServiceDeps extends PlatformDeps {
  audit: AuditService;
}

export interface SettingsService {
  /** The settings in force. No permission check: for other modules' use cases. */
  current(db?: DbOrTx): Promise<Settings>;
  /** What the workshop shows to everyone: its name, address, phone, map and policy link. */
  publicInfo(db?: DbOrTx): Promise<WorkshopInfo>;
  /** The same for the panel: any staff member sees the workshop's name. */
  panelInfo(actor: StaffActor): Promise<WorkshopInfo>;
  /** For the owner's form. */
  get(actor: StaffActor): Promise<Settings>;
  update(actor: StaffActor, input: Settings, ip?: string): Promise<Settings>;
}

export function infoOf({ workshop }: Settings): WorkshopInfo {
  return {
    name: workshop.name,
    address: workshop.address,
    phone: workshop.phone,
    mapUrl: workshop.mapUrl,
    policyUrl: workshop.policyUrl,
  };
}

export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
  const { db, audit, clock } = deps;

  async function current(from: DbOrTx = db): Promise<Settings> {
    const [row] = await from
      .select({ data: settings.data })
      .from(settings)
      .where(eq(settings.id, 1));
    return readSettings(row?.data);
  }

  return {
    current,

    async publicInfo(from = db) {
      return infoOf(await current(from));
    },

    async panelInfo(actor) {
      requirePermission(actor, 'panel.access');
      return infoOf(await current());
    },

    async get(actor) {
      requirePermission(actor, 'settings.write');
      return current();
    },

    async update(actor, input, ip) {
      requirePermission(actor, 'settings.write');

      // The phone is kept as +998XXXXXXXXX, however it was typed.
      let phone: string | null = null;
      if (input.workshop.phone !== null) {
        phone = normalizePhone(input.workshop.phone);
        if (!phone) throw invalidAt('body.workshop.phone', 'not a phone number');
      }
      // Checked again in the schema's own order, so the comparison below is not fooled by key order.
      const checked = settingsSchema.safeParse({
        workshop: { ...input.workshop, phone },
        rules: normalizeRules(input.rules),
      });
      if (!checked.success) {
        throw new AppError('validation', 'invalid settings', {
          paths: checked.error.issues.map((issue) => ['body', ...issue.path].join('.')),
        });
      }
      const next = checked.data;

      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(settings).where(eq(settings.id, 1)).for('update');
        const before = readSettings(row?.data);
        if (JSON.stringify(before) === JSON.stringify(next)) return before;

        await tx
          .insert(settings)
          .values({ id: 1, data: next, updatedBy: actor.userId, updatedAt: clock.now() })
          .onConflictDoUpdate({
            target: settings.id,
            set: { data: next, updatedBy: actor.userId, updatedAt: clock.now() },
          });
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'settings.update',
          entity: 'settings',
          entityId: '1',
          before,
          after: next,
          ip: ip ?? null,
        });
        return next;
      });
    },
  };
}
