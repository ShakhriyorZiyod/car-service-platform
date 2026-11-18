import type { AdminOrder, Order } from '@cs/shared';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../../db/client';
import { orderItems, orders } from '../../../db/schema';
import { requirePermission, type ClientActor, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import type { Outbox } from '../../../platform/outbox';
import type { StaffDirectory } from '../../../platform/ports';
import type { AuditService } from '../../audit';
import type { OffersService } from '../../catalog';
import { totalsAt } from '../domain/discount';
import type { AdminOrdersService } from './admin-orders';
import type { OrdersService } from './orders';
import { retotal } from './totals';

/**
 * Extra work found while the car is in the shop (docs/PLAN.md, section 9.3): the admin adds it, the
 * client is asked, and it counts toward the total only if they agree. An unanswered extra holds
 * the order back from "ready for pickup".
 */

export interface ExtrasDeps extends PlatformDeps {
  catalog: OffersService;
  outbox: Outbox;
  staff: StaffDirectory;
  audit: AuditService;
  admin: AdminOrdersService;
  client: OrdersService;
}

export interface NewExtra {
  serviceId: string;
  /** Left out: the price list's. `null`: to be agreed. */
  price?: number | null | undefined;
  comment?: string | null | undefined;
}

export type ExtraDecision = 'approved' | 'rejected';

export interface ExtrasService {
  add(actor: StaffActor, orderId: string, input: NewExtra, ip?: string): Promise<AdminOrder>;
  /** The client answered the admin on the phone. */
  decideByPhone(
    actor: StaffActor,
    orderId: string,
    itemId: string,
    decision: ExtraDecision,
    ip?: string,
  ): Promise<AdminOrder>;
  /**
   * The client's own answer, in the app or in the bot. Only the order's owner can give it, and only
   * once: a second answer is `already_decided`.
   */
  decideAsClient(
    client: ClientActor,
    itemId: string,
    decision: ExtraDecision,
    via: 'tma' | 'bot',
    /** The order the answer is meant for; the item must be on it. */
    orderId?: string,
  ): Promise<Order>;
}

const STAFF_ROLES = ['admin', 'owner'] as const;

export function createExtrasService(deps: ExtrasDeps): ExtrasService {
  const { db, clock, catalog, outbox, staff, audit, admin, client: clientOrders } = deps;

  /**
   * Records the answer inside the caller's transaction: the item, and the order's totals when it
   * was agreed. Then the order may turn out to be ready.
   */
  async function decideInside(
    tx: Tx,
    orderId: string,
    itemId: string,
    decision: ExtraDecision,
    via: 'tma' | 'bot' | 'phone',
  ): Promise<void> {
    const now = clock.now();
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new AppError('not_found');
    const [item] = await tx
      .select()
      .from(orderItems)
      .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)));
    if (!item || item.kind !== 'extra') throw new AppError('not_found');
    if (item.approval !== 'pending') throw new AppError('already_decided');
    // Only while the car is in work: later there is nothing left to ask.
    if (order.status !== 'in_work') throw new AppError('invalid_transition');

    const [decided] = await tx
      .update(orderItems)
      .set({ approval: decision, approvalVia: via, approvalAt: now })
      .where(and(eq(orderItems.id, itemId), eq(orderItems.approval, 'pending')))
      .returning({ id: orderItems.id });
    if (!decided) throw new AppError('already_decided');

    // Agreed work counts now; a percentage discount grows with it (PLAN 11).
    if (decision === 'approved') await retotal(tx, orderId, now);

    if (via !== 'phone') {
      // The admins hear the client's answer; the admin who wrote it down by phone knows it.
      const snapshot = order.carSnapshot as { label: string; plate: string };
      for (const recipient of await staff.recipients(tx, STAFF_ROLES)) {
        await outbox.enqueue(tx, {
          to: recipient,
          notification: {
            type: 'staff.extra_decided',
            orderId,
            number: order.number,
            car: snapshot.label,
            plate: snapshot.plate,
            itemName: { uz: item.nameUz, ru: item.nameRu },
            decision,
            via,
          },
          dedupeKey: `extra:${itemId}:decided:${recipient.userId}`,
        });
      }
    }
    // The last thing holding the order back may have just gone.
    await admin.onTasksChanged(tx, orderId);
  }

  return {
    async add(actor, orderId, input, ip) {
      requirePermission(actor, 'orders.write');
      await db.transaction(async (tx) => {
        const now = clock.now();
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
        if (!order) throw new AppError('not_found');
        if (order.status !== 'in_work') throw new AppError('invalid_transition');

        const [offer] = await catalog.offers([input.serviceId], order.bodyClass, tx);
        if (!offer) throw new AppError('validation', 'unknown zone', { paths: ['body.serviceId'] });
        if (!offer.isActive || !offer.cell) {
          throw new AppError('service_unavailable', 'not offered for this car', {
            paths: ['body.serviceId'],
          });
        }
        const price = input.price === undefined ? offer.cell.price : input.price;
        const [item] = await tx
          .insert(orderItems)
          .values({
            orderId,
            serviceId: offer.serviceId,
            serviceTypeId: offer.serviceTypeId,
            nameUz: offer.nameUz,
            nameRu: offer.nameRu,
            typeNameUz: offer.typeNameUz,
            typeNameRu: offer.typeNameRu,
            bodyClass: order.bodyClass,
            price,
            durationMin: offer.cell.durationMin,
            comment: input.comment ?? null,
            kind: 'extra',
            approval: 'pending',
            createdBy: actor.userId,
            createdAt: now,
          })
          .returning();
        if (!item) throw new Error('insert returned no row');

        const snapshot = order.carSnapshot as { label: string; plate: string };
        await outbox.tell(
          tx,
          order.clientId,
          {
            type: 'extra.approval_request',
            orderId,
            number: order.number,
            car: snapshot.label,
            plate: snapshot.plate,
            itemId: item.id,
            itemName: { uz: item.nameUz, ru: item.nameRu },
            price,
            // What the total would be if they agree, the discount following the subtotal.
            newTotal: totalsAt(order, order.subtotal + (price ?? 0)).total,
          },
          `extra:${item.id}:ask`,
        );
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.extra.add',
          entity: 'order',
          entityId: orderId,
          after: { serviceId: offer.serviceId, price },
          ip: ip ?? null,
        });
      });
      return admin.get(actor, orderId);
    },

    async decideByPhone(actor, orderId, itemId, decision, ip) {
      requirePermission(actor, 'orders.write');
      await db.transaction(async (tx) => {
        await decideInside(tx, orderId, itemId, decision, 'phone');
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'order.extra.decide',
          entity: 'order',
          entityId: orderId,
          after: { itemId, decision, via: 'phone' },
          ip: ip ?? null,
        });
      });
      return admin.get(actor, orderId);
    },

    async decideAsClient(client, itemId, decision, via, orderId) {
      const resolvedOrderId = await db.transaction(async (tx) => {
        const [item] = await tx.select().from(orderItems).where(eq(orderItems.id, itemId));
        if (!item || (orderId !== undefined && item.orderId !== orderId)) {
          throw new AppError('not_found');
        }
        const [order] = await tx.select().from(orders).where(eq(orders.id, item.orderId));
        // Somebody else's order does not exist for them.
        if (!order || order.clientId !== client.userId) throw new AppError('not_found');
        await decideInside(tx, order.id, itemId, decision, via);
        return order.id;
      });
      return clientOrders.get(client, resolvedOrderId);
    },
  };
}
