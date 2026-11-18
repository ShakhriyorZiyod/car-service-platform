import type { Availability, Order, Quote as QuoteView, Slots } from '@cs/shared';
import {
  ACTIVE_ORDER_STATUSES,
  type BodyClass,
  type OrderStatus,
  type OrderTab,
} from '@cs/shared/vocabulary';
import { and, desc, eq, inArray, isNotNull, lte, notInArray } from 'drizzle-orm';
import type { DbOrTx } from '../../../db/client';
import { cancelReasons, orderItems, orders, users } from '../../../db/schema';
import type { Notification } from '../../../notifications/types';
import { requireVerifiedPhone, type ClientActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError, invalidAt } from '../../../platform/errors';
import { violatedUniqueConstraint } from '../../../platform/pg-errors';
import type { Outbox } from '../../../platform/outbox';
import type { StaffDirectory } from '../../../platform/ports';
import { recordStatus } from '../../../platform/status-history';
import type { BookingService, JobSpec } from '../../booking';
import type { OffersService } from '../../catalog';
import type { GarageService } from '../../garage';
import { createWorkTime, longestWorkdayMinutes, type WorkshopService } from '../../workshop';
import { holdExpired, holdUntil } from '../domain/hold';
import { canTransition, clientActions } from '../domain/order-status';
import { buildQuote, serviceTypesOf, type Quote, type QuoteProblem } from '../domain/quote';
import { createViews, slotView, type OrderRow } from './views';

/**
 * The client's orders (docs/PLAN.md, sections 7.8, 9.1, 10.4 and 12): pricing, booking, the list
 * and tracking, cancelling and asking to move the time, and cancelling by itself what the workshop
 * never called about. Everything works on the caller's own orders; another client's order is
 * `not_found`.
 */

export interface OrdersServiceDeps extends PlatformDeps {
  workshop: Pick<WorkshopService, 'settings' | 'hours' | 'boxes'>;
  catalog: OffersService;
  garage: GarageService;
  booking: BookingService;
  outbox: Outbox;
  staff: StaffDirectory;
}

export interface CarChoice {
  carId: string;
  serviceIds: readonly string[];
}

export interface NewOrder extends CarChoice {
  requestId: string;
  startsAt: Date;
  comment?: string | null | undefined;
}

export interface OrdersService {
  quote(actor: ClientActor, input: CarChoice): Promise<QuoteView>;
  availability(actor: ClientActor, input: CarChoice): Promise<Availability>;
  slots(actor: ClientActor, input: CarChoice & { date: string }): Promise<Slots>;
  /** Idempotent: the same `requestId` of the same client gives the same order. */
  create(actor: ClientActor, input: NewOrder): Promise<Order>;
  list(actor: ClientActor, tab: OrderTab): Promise<Order[]>;
  get(actor: ClientActor, id: string): Promise<Order>;
  cancel(
    actor: ClientActor,
    id: string,
    input: { reasonId: string; note?: string | null | undefined },
  ): Promise<Order>;
  requestReschedule(actor: ClientActor, id: string): Promise<Order>;
  /**
   * Cancels new orders whose hold ran out without a call (docs/PLAN.md, section 10.4): the box is
   * given back and the client is told, once. Returns how many it cancelled.
   */
  expireHolds(now: Date): Promise<number>;
}

const STAFF_ROLES = ['admin', 'owner'] as const;

const PROBLEM_FIELD: Record<QuoteProblem, 'validation' | 'service_unavailable'> = {
  nothing_chosen: 'validation',
  unknown_zone: 'validation',
  zone_not_in_use: 'service_unavailable',
  not_offered_for_class: 'service_unavailable',
  zones_exclude_each_other: 'service_unavailable',
};

interface Prepared {
  car: { id: string; bodyClass: BodyClass };
  label: string;
  plate: string;
  carSnapshot: Record<string, unknown>;
  quote: Quote;
  job: JobSpec;
  rules: Awaited<ReturnType<WorkshopService['settings']['current']>>['rules'];
  calendar: Awaited<ReturnType<WorkshopService['hours']['calendar']>>;
  workshopPhone: string | null;
}

export function createOrdersService(deps: OrdersServiceDeps): OrdersService {
  const { db, clock, workshop, catalog, garage, booking, outbox, staff } = deps;

  /** Prices the choice for the client's own car. Reads only, with the connection it is given. */
  async function prepare(from: DbOrTx, actor: ClientActor, input: CarChoice): Promise<Prepared> {
    requireVerifiedPhone(actor);
    const { car, label } = await garage.own(actor.userId, input.carId, from);
    // One query after another: a transaction has a single connection.
    const settings = await workshop.settings.current(from);
    const calendar = await workshop.hours.calendar(from);
    const offers = await catalog.offers(input.serviceIds, car.bodyClass, from);
    const result = buildQuote(input.serviceIds, offers, {
      bufferMin: settings.rules.bufferMin,
      longestWorkdayMin: longestWorkdayMinutes(calendar),
    });
    if (!result.ok) {
      throw new AppError(PROBLEM_FIELD[result.problem], result.problem, {
        paths: ['body.serviceIds'],
      });
    }
    return {
      car: { id: car.id, bodyClass: car.bodyClass },
      label,
      plate: car.plate,
      carSnapshot: {
        label,
        brand: car.brand,
        model: car.model,
        year: car.year,
        plate: car.plate,
        color: car.color,
        bodyClass: car.bodyClass,
      },
      quote: result.quote,
      job: { serviceTypeIds: serviceTypesOf(result.quote), workMinutes: result.quote.totalMinutes },
      rules: settings.rules,
      calendar,
      workshopPhone: settings.workshop.phone,
    };
  }

  const { viewsOf, factsOf, bookingOf } = createViews(booking);

  async function ownRow(from: DbOrTx, clientId: string, id: string): Promise<OrderRow> {
    const [row] = await from
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.clientId, clientId)));
    if (!row) throw new AppError('not_found');
    return row;
  }

  async function ownView(from: DbOrTx, clientId: string, id: string): Promise<Order> {
    const [view] = await viewsOf(from, [await ownRow(from, clientId, id)]);
    if (!view) throw new AppError('not_found');
    return view;
  }

  async function findByRequest(from: DbOrTx, clientId: string, requestId: string) {
    const [row] = await from
      .select()
      .from(orders)
      .where(and(eq(orders.clientId, clientId), eq(orders.clientRequestId, requestId)));
    return row;
  }

  return {
    async quote(actor, input) {
      const { quote } = await prepare(db, actor, input);
      return {
        items: quote.lines.map(({ serviceTypeId: _type, ...line }) => line),
        subtotal: quote.subtotal,
        unpricedCount: quote.unpricedCount,
        workMinutes: quote.workMinutes,
        bufferMin: quote.bufferMin,
        totalMinutes: quote.totalMinutes,
        multiDay: quote.multiDay,
      };
    },

    async availability(actor, input) {
      const prepared = await prepare(db, actor, input);
      return {
        days: await booking.availability(prepared.job),
        multiDay: prepared.quote.multiDay,
      };
    },

    async slots(actor, input) {
      const prepared = await prepare(db, actor, input);
      const { slots, nearest } = await booking.slots(prepared.job, input.date);
      return {
        date: input.date,
        slots: slots.map(slotView),
        nearest: nearest.map(slotView),
        multiDay: prepared.quote.multiDay,
      };
    },

    async create(actor, input) {
      requireVerifiedPhone(actor);
      const earlier = await findByRequest(db, actor.userId, input.requestId);
      if (earlier) return ownView(db, actor.userId, earlier.id);

      // Everything that needs a connection is read before the transaction opens.
      const prepared = await prepare(db, actor, input);
      const admins = await staff.recipients(db, STAFF_ROLES);

      try {
        return await db.transaction(async (tx) => {
          const now = clock.now();
          const hold = holdUntil(
            createWorkTime(prepared.calendar),
            now,
            prepared.rules.holdNewWorkMin,
          );
          const [order] = await tx
            .insert(orders)
            .values({
              status: 'new',
              source: 'tma',
              clientId: actor.userId,
              carId: prepared.car.id,
              carSnapshot: prepared.carSnapshot,
              bodyClass: prepared.car.bodyClass,
              clientComment: input.comment ?? null,
              subtotal: prepared.quote.subtotal,
              discountAmount: 0,
              total: prepared.quote.subtotal,
              holdUntil: hold,
              clientRequestId: input.requestId,
              createdBy: null,
              // From the clock, not the database's now(): the waiting time is counted from here.
              createdAt: now,
            })
            .returning();
          if (!order) throw new Error('insert returned no row');

          await tx.insert(orderItems).values(
            prepared.quote.lines.map((line) => ({
              orderId: order.id,
              serviceId: line.serviceId,
              serviceTypeId: line.serviceTypeId,
              nameUz: line.nameUz,
              nameRu: line.nameRu,
              typeNameUz: line.typeNameUz,
              typeNameRu: line.typeNameRu,
              bodyClass: prepared.car.bodyClass,
              price: line.price,
              durationMin: line.durationMin,
            })),
          );

          // The box is taken last: if every box is held, the whole transaction rolls back and no
          // order exists. Two clients after the same time can never both get it.
          const reservation = await booking.reserve(tx, {
            orderId: order.id,
            startsAt: input.startsAt,
            job: prepared.job,
            createdBy: null,
          });
          await recordStatus(tx, {
            entity: 'order',
            entityId: order.id,
            from: null,
            to: 'new',
            actorId: actor.userId,
            at: now,
          });

          const facts = await factsOf(tx, order, reservation);
          await outbox.enqueue(tx, {
            to: { userId: actor.userId, lang: actor.lang },
            notification: { type: 'order.created', ...facts },
            dedupeKey: `order.created:${order.id}`,
          });
          for (const admin of admins) {
            await outbox.enqueue(tx, {
              to: admin,
              notification: { type: 'staff.order_new', ...facts, clientName: actor.fullName },
              dedupeKey: `staff.order_new:${order.id}:${admin.userId}`,
            });
          }
          return ownView(tx, actor.userId, order.id);
        });
      } catch (error) {
        // The same request arrived twice at once: the other one won, and its order is the answer.
        if (violatedUniqueConstraint(error) === 'orders_client_request_unique') {
          const winner = await findByRequest(db, actor.userId, input.requestId);
          if (winner) return ownView(db, actor.userId, winner.id);
        }
        throw error;
      }
    },

    async list(actor, tab) {
      const statuses = [...ACTIVE_ORDER_STATUSES] as OrderStatus[];
      const rows = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.clientId, actor.userId),
            tab === 'active'
              ? inArray(orders.status, statuses)
              : notInArray(orders.status, statuses),
          ),
        )
        .orderBy(desc(orders.createdAt), desc(orders.id));
      return viewsOf(db, rows);
    },

    get: (actor, id) => ownView(db, actor.userId, id),

    async cancel(actor, id, input) {
      await ownRow(db, actor.userId, id);
      const admins = await staff.recipients(db, STAFF_ROLES);

      return db.transaction(async (tx) => {
        const now = clock.now();
        const [locked] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, id), eq(orders.clientId, actor.userId)))
          .for('update');
        if (!locked) throw new AppError('not_found');
        if (!canTransition(locked.status, 'cancelled', 'client')) {
          throw new AppError('invalid_transition', `${locked.status} → cancelled`);
        }

        const [reason] = await tx
          .select()
          .from(cancelReasons)
          .where(eq(cancelReasons.id, input.reasonId));
        // A client may give the reasons meant for clients, and no other.
        if (!reason?.isActive || reason.appliesTo !== 'client') {
          throw invalidAt('body.reasonId', 'not a reason a client may give');
        }
        const note = input.note?.trim() || null;
        if (reason.requiresText && note === null) {
          throw invalidAt('body.note', 'this reason needs a few words');
        }

        const [updated] = await tx
          .update(orders)
          .set({
            status: 'cancelled',
            cancelledAt: now,
            cancelledBy: actor.userId,
            cancelReasonId: reason.id,
            cancelNote: note,
            holdUntil: null,
            updatedAt: now,
          })
          // Only from the status that was checked: a change made at the same moment is not undone.
          .where(and(eq(orders.id, id), eq(orders.status, locked.status)))
          .returning();
        if (!updated) throw new AppError('invalid_transition');

        const reservation = await bookingOf(tx, id);
        await booking.release(tx, id, 'cancelled');
        await recordStatus(tx, {
          entity: 'order',
          entityId: id,
          from: locked.status,
          to: 'cancelled',
          actorId: actor.userId,
          reasonId: reason.id,
          comment: note,
          at: now,
        });

        const facts = await factsOf(tx, updated, reservation);
        for (const admin of admins) {
          await outbox.enqueue(tx, {
            to: admin,
            notification: {
              type: 'staff.client_cancelled',
              ...facts,
              clientName: actor.fullName,
              reason: { uz: reason.nameUz, ru: reason.nameRu },
              note,
            },
            dedupeKey: `staff.client_cancelled:${id}:${admin.userId}`,
          });
        }
        return ownView(tx, actor.userId, id);
      });
    },

    async requestReschedule(actor, id) {
      await ownRow(db, actor.userId, id);
      const admins = await staff.recipients(db, STAFF_ROLES);

      return db.transaction(async (tx) => {
        const now = clock.now();
        const [locked] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, id), eq(orders.clientId, actor.userId)))
          .for('update');
        if (!locked) throw new AppError('not_found');
        const actions = clientActions({
          status: locked.status,
          rescheduleRequested: locked.rescheduleRequestedAt !== null,
        });
        if (!actions.canRequestReschedule) throw new AppError('invalid_transition');

        const [updated] = await tx
          .update(orders)
          .set({ rescheduleRequestedAt: now, updatedAt: now })
          .where(eq(orders.id, id))
          .returning();
        if (!updated) throw new AppError('not_found');

        const facts = await factsOf(tx, updated, await bookingOf(tx, id));
        for (const admin of admins) {
          await outbox.enqueue(tx, {
            to: admin,
            notification: {
              type: 'staff.reschedule_requested',
              ...facts,
              clientName: actor.fullName,
            },
            dedupeKey: `staff.reschedule_requested:${id}:${admin.userId}`,
          });
        }
        return ownView(tx, actor.userId, id);
      });
    },

    async expireHolds(now) {
      const due = await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(eq(orders.status, 'new'), isNotNull(orders.holdUntil), lte(orders.holdUntil, now)),
        );
      const [reason] = await db
        .select()
        .from(cancelReasons)
        .where(eq(cancelReasons.code, 'no_contact'));
      const { workshop: info } = await workshop.settings.current();
      let cancelled = 0;

      for (const { id } of due) {
        const done = await db.transaction(async (tx) => {
          const [locked] = await tx.select().from(orders).where(eq(orders.id, id)).for('update');
          if (!locked) return false;
          const reservation = await bookingOf(tx, id);
          // Decided on the locked row: an admin who confirmed it a moment ago keeps it.
          if (
            !holdExpired(
              {
                status: locked.status,
                holdUntil: locked.holdUntil,
                startsAt: reservation.startsAt,
              },
              now,
            )
          ) {
            return false;
          }
          const [updated] = await tx
            .update(orders)
            .set({
              status: 'cancelled',
              cancelledAt: now,
              cancelledBy: null,
              cancelReasonId: reason?.id ?? null,
              holdUntil: null,
              updatedAt: now,
            })
            .where(and(eq(orders.id, id), eq(orders.status, 'new')))
            .returning();
          if (!updated) return false;

          await booking.release(tx, id, 'hold_expired');
          await recordStatus(tx, {
            entity: 'order',
            entityId: id,
            from: 'new',
            to: 'cancelled',
            actorId: null,
            reasonId: reason?.id ?? null,
            at: now,
          });

          const lang = await clientLang(tx, locked.clientId);
          const notification: Notification = {
            type: 'order.cancelled',
            ...(await factsOf(tx, updated, reservation)),
            reason: reason ? { uz: reason.nameUz, ru: reason.nameRu } : null,
            workshopPhone: info.phone,
          };
          await outbox.enqueue(tx, {
            to: { userId: locked.clientId, lang },
            notification,
            dedupeKey: `order.cancelled:${id}`,
          });
          return true;
        });
        if (done) cancelled += 1;
      }
      return cancelled;
    },
  };
}

async function clientLang(from: DbOrTx, userId: string): Promise<'uz' | 'ru'> {
  const [row] = await from.select({ lang: users.lang }).from(users).where(eq(users.id, userId));
  return row?.lang ?? 'uz';
}
