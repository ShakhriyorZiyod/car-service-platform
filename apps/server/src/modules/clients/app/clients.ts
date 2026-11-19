import type { Car, ClientCard, ClientSummary } from '@cs/shared';
import type { ClientFilter } from '@cs/shared/vocabulary';
import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import { users } from '../../../db/schema';
import { addDays, localDateOf, presentInstant } from '../../../lib/time';
import { requirePermission, type StaffActor } from '../../../platform/actors';
import type { PlatformDeps } from '../../../platform/deps';
import { AppError } from '../../../platform/errors';
import type { AuditService } from '../../audit';
import type { GarageService } from '../../garage';
import type { ClientsWriter } from '../../identity';
import type { AdminOrdersService } from '../../orders';

/**
 * The clients, for the staff (docs/PLAN.md, sections 4.2, 8 and 15; design A10): the list with its
 * filters, the card, a client entered by hand, the admin's note, and erasing a client's personal
 * data. Reads the tables; writes through identity, garage and orders, which own them.
 */

export interface ClientsServiceDeps extends PlatformDeps {
  audit: AuditService;
  identity: ClientsWriter;
  garage: GarageService;
  orders: AdminOrdersService;
}

export interface ClientQuery {
  q?: string | undefined;
  filter: ClientFilter;
  cursor?: string | undefined;
  limit: number;
}

export interface NewClientCar {
  modelId: string | null;
  customModelText: string | null;
  bodyClass: Car['bodyClass'] | null;
  year: number;
  plate: string;
  color: string | null;
}

export interface ClientsService {
  list(
    actor: StaffActor,
    query: ClientQuery,
  ): Promise<{ items: ClientSummary[]; nextCursor: string | null }>;
  get(actor: StaffActor, id: string): Promise<ClientCard>;
  create(
    actor: StaffActor,
    input: { fullName: string; phone: string },
    ip?: string,
  ): Promise<ClientCard>;
  update(
    actor: StaffActor,
    id: string,
    patch: {
      fullName?: string | undefined;
      phone?: string | undefined;
      internalNote?: string | null | undefined;
    },
    ip?: string,
  ): Promise<ClientCard>;
  addCar(actor: StaffActor, clientId: string, input: NewClientCar): Promise<Car>;
  /** The owner erases a client's personal data; orders and payments stay (TZ 15.3). */
  anonymize(actor: StaffActor, id: string, ip?: string): Promise<ClientCard>;
}

/** A client who has not been for this long is "lapsed" (PLAN 18, stage 4). */
const LAPSED_DAYS = 90;
/** Two finished visits make a regular. */
const REGULAR_VISITS = 2;
const CARD_ORDERS = 20;

const likeEscape = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

export function createClientsService(deps: ClientsServiceDeps): ClientsService {
  const { db, clock, audit, identity, garage, orders } = deps;

  // In a select list Drizzle writes a column without its table, and inside a subquery "id" would
  // then mean the subquery's own: the outer id is spelled out.
  const outerId = sql.raw('"users"."id"');

  // What makes a person a client: no staff role and no panel login.
  const isClient = sql`not exists (select 1 from user_roles r where r.user_id = ${users.id}) and ${users.login} is null`;
  const carsCount = sql<number>`(select count(*)::int from cars c where c.client_id = ${outerId} and c.archived_at is null)`;
  const ordersCount = sql<number>`(select count(*)::int from orders o where o.client_id = ${outerId})`;
  const visits = sql<number>`(select count(*)::int from orders o where o.client_id = ${outerId} and o.status = 'completed')`;
  // Each finished order counts at its last booking: one moved earlier is not still late.
  const lastVisit = sql<Date | null>`(select max(lb.starts_at) from orders o join lateral (select b.starts_at from bookings b where b.order_id = o.id order by (b.released_at is null) desc, b.created_at desc, b.id desc limit 1) lb on true where o.client_id = ${outerId} and o.status = 'completed')`;
  const hasActiveOrder = sql`exists (select 1 from orders o where o.client_id = ${outerId} and o.status in ('new', 'confirmed', 'in_work', 'ready_for_pickup'))`;

  const summaries = (where: SQL | undefined, limit: number) =>
    db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        telegramId: users.telegramId,
        deletionRequestedAt: users.deletionRequestedAt,
        anonymizedAt: users.anonymizedAt,
        cars: carsCount,
        orders: ordersCount,
        lastVisit,
      })
      .from(users)
      .where(and(isClient, where))
      .orderBy(desc(users.id))
      .limit(limit);

  type SummaryRow = Awaited<ReturnType<typeof summaries>>[number];
  const toSummary = (row: SummaryRow): ClientSummary => ({
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    hasTelegram: row.telegramId !== null,
    carsCount: row.cars,
    ordersCount: row.orders,
    lastVisit: row.lastVisit ? presentInstant(new Date(row.lastVisit)) : null,
    deletionRequested: row.deletionRequestedAt !== null,
    isAnonymized: row.anonymizedAt !== null,
  });

  async function card(actor: StaffActor, id: string): Promise<ClientCard> {
    const [row] = await summaries(eq(users.id, id), 1);
    if (!row) throw new AppError('not_found');
    const [extra] = await db
      .select({
        phoneVerified: users.phoneVerified,
        internalNote: users.internalNote,
        telegramId: users.telegramId,
      })
      .from(users)
      .where(eq(users.id, id));
    return {
      ...toSummary(row),
      phoneVerified: extra?.phoneVerified ?? false,
      internalNote: extra?.internalNote ?? null,
      telegramId: extra?.telegramId ?? null,
      cars: await garage.listFor(id),
      orders: await orders.forClient(actor, id, CARD_ORDERS),
    };
  }

  return {
    async list(actor, query) {
      requirePermission(actor, 'clients.read');
      const conditions: (SQL | undefined)[] = [];
      if (query.cursor) conditions.push(lt(users.id, query.cursor));
      if (query.filter === 'no_telegram') conditions.push(sql`${users.telegramId} is null`);
      if (query.filter === 'regular') conditions.push(sql`${visits} >= ${REGULAR_VISITS}`);
      if (query.filter === 'lapsed') {
        const cutoff = new Date(
          Date.parse(`${addDays(localDateOf(clock.now()), -LAPSED_DAYS)}T00:00:00+05:00`),
        );
        conditions.push(sql`${lastVisit} < ${cutoff}`, sql`not ${hasActiveOrder}`);
      }
      if (query.q) {
        const text = likeEscape(query.q);
        const digits = query.q.replace(/\D/g, '');
        const plate = likeEscape(query.q.replace(/\s+/g, '').toUpperCase());
        conditions.push(
          or(
            sql`${users.fullName} ilike ${`%${text}%`}`,
            digits === '' ? sql`false` : sql`${users.phone} like ${`%${digits}%`}`,
            sql`exists (select 1 from cars c where c.client_id = ${outerId} and c.plate like ${`%${plate}%`})`,
          ),
        );
      }
      const rows = await summaries(and(...conditions), query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(toSummary),
        nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },

    async get(actor, id) {
      requirePermission(actor, 'clients.read');
      return card(actor, id);
    },

    async create(actor, input, ip) {
      requirePermission(actor, 'clients.write');
      const created = await identity.create({ ...input, createdBy: actor.userId });
      await audit.record(db, {
        actorId: actor.userId,
        action: 'client.create',
        entity: 'client',
        entityId: created.id,
        after: { fullName: created.fullName, phone: created.phone },
        ip: ip ?? null,
      });
      return card(actor, created.id);
    },

    async update(actor, id, patch, ip) {
      requirePermission(actor, 'clients.write');
      const before = await identity.get(id);
      const after = await identity.update(id, patch);
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await audit.record(db, {
          actorId: actor.userId,
          action: 'client.update',
          entity: 'client',
          entityId: id,
          // The note is the admin's own words; the log only says that it changed.
          before: {
            fullName: before.fullName,
            phone: before.phone,
            hasNote: before.internalNote !== null,
          },
          after: {
            fullName: after.fullName,
            phone: after.phone,
            hasNote: after.internalNote !== null,
          },
          ip: ip ?? null,
        });
      }
      return card(actor, id);
    },

    async addCar(actor, clientId, input) {
      requirePermission(actor, 'clients.write');
      // The client must exist and be a client.
      await card(actor, clientId);
      return garage.createFor(clientId, input);
    },

    async anonymize(actor, id, ip) {
      requirePermission(actor, 'clients.anonymize');
      await card(actor, id);
      await db.transaction(async (tx) => {
        await identity.anonymize(tx, id);
        await garage.anonymize(tx, id);
        await orders.anonymize(tx, id);
        await audit.record(tx, {
          actorId: actor.userId,
          action: 'client.anonymize',
          entity: 'client',
          entityId: id,
          ip: ip ?? null,
        });
      });
      const [row] = await summaries(eq(users.id, id), 1);
      if (!row) throw new AppError('not_found');
      return {
        ...toSummary(row),
        phoneVerified: false,
        internalNote: null,
        telegramId: null,
        cars: [],
        orders: await orders.forClient(actor, id, CARD_ORDERS),
      };
    },
  };
}
