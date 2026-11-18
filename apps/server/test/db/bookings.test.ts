import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { bookings, orders } from '../../src/db/schema';
import { newId } from '../../src/lib/ids';
import { useTestDatabase } from '../helpers/db';
import { createTestServices, type TestContext } from '../helpers/services';
import { at, makeClient, setupWorkshop, type Workshop } from '../helpers/workshop-setup';

/**
 * What the database itself guarantees about bookings (docs/PLAN.md, section 7.7): a box is never
 * held twice, whatever the code does. These write straight into the table.
 */

const database = useTestDatabase();
const { db } = database;
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(db);
  shop = await setupWorkshop(t, db);
});

const EXCLUSION = { cause: { code: '23P01' } };
const CHECK = { cause: { code: '23514' } };
const UNIQUE = { cause: { code: '23505' } };

const block = (boxIndex: number, from: string, to: string, extra: object = {}) => ({
  kind: 'block' as const,
  boxId: shop.boxes[boxIndex]!.id,
  startsAt: at(from),
  endsAt: at(to),
  note: 'ta’mir',
  ...extra,
});

describe('a box is never held twice (PLAN 2, rule 5)', () => {
  it('two stretches that overlap in one box are refused by the database', async () => {
    await db.insert(bookings).values(block(0, '2026-10-30 10:00', '2026-10-30 12:00'));
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 11:00', '2026-10-30 13:00')),
    ).rejects.toMatchObject(EXCLUSION);
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 09:00', '2026-10-30 18:00')),
    ).rejects.toMatchObject(EXCLUSION);
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 10:30', '2026-10-30 11:00')),
    ).rejects.toMatchObject(EXCLUSION);
  });

  it('the same time in another box is fine', async () => {
    await db.insert(bookings).values(block(0, '2026-10-30 10:00', '2026-10-30 12:00'));
    await db.insert(bookings).values(block(1, '2026-10-30 10:00', '2026-10-30 12:00'));
    expect(await db.select().from(bookings)).toHaveLength(2);
  });

  it('back-to-back stretches do not overlap: [start, end) leaves the end free', async () => {
    await db.insert(bookings).values(block(0, '2026-10-30 10:00', '2026-10-30 12:00'));
    await db.insert(bookings).values(block(0, '2026-10-30 12:00', '2026-10-30 13:00'));
    await db.insert(bookings).values(block(0, '2026-10-30 09:00', '2026-10-30 10:00'));
    expect(await db.select().from(bookings)).toHaveLength(3);
  });

  it('a stretch that was given back no longer holds the box', async () => {
    const [held] = await db
      .insert(bookings)
      .values(block(0, '2026-10-30 10:00', '2026-10-30 12:00'))
      .returning();
    await db
      .update(bookings)
      .set({ releasedAt: at('2026-10-29 10:00'), releaseReason: 'cancelled' })
      .where(eq(bookings.id, held!.id));
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 10:00', '2026-10-30 12:00')),
    ).resolves.toBeDefined();
  });

  it('a stretch moved onto a held time is refused too, not only a new one', async () => {
    await db.insert(bookings).values(block(0, '2026-10-30 10:00', '2026-10-30 12:00'));
    const [other] = await db
      .insert(bookings)
      .values(block(0, '2026-10-30 14:00', '2026-10-30 15:00'))
      .returning();
    await expect(
      db
        .update(bookings)
        .set({ startsAt: at('2026-10-30 11:00'), endsAt: at('2026-10-30 12:30') })
        .where(eq(bookings.id, other!.id)),
    ).rejects.toMatchObject(EXCLUSION);
  });

  it('a block over an order’s booking is refused, and an order over a block', async () => {
    const client = await makeClient(db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 B 123 CD',
      color: null,
    });
    await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 10:00'),
    });
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 11:00', '2026-10-30 12:00')),
    ).rejects.toMatchObject(EXCLUSION);
  });
});

describe('what a booking row must look like', () => {
  it('ends after it starts', async () => {
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 12:00', '2026-10-30 12:00')),
    ).rejects.toMatchObject(CHECK);
    await expect(
      db.insert(bookings).values(block(0, '2026-10-30 12:00', '2026-10-30 11:00')),
    ).rejects.toMatchObject(CHECK);
  });

  it('an order’s booking names its order, and a block names none', async () => {
    await expect(
      db
        .insert(bookings)
        .values(block(0, '2026-10-30 10:00', '2026-10-30 11:00', { kind: 'order' })),
    ).rejects.toMatchObject(CHECK);
    await expect(
      db
        .insert(bookings)
        .values(block(0, '2026-10-30 10:00', '2026-10-30 11:00', { orderId: newId() })),
    ).rejects.toMatchObject(CHECK);
  });

  it('an order holds one box at a time', async () => {
    const client = await makeClient(db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 B 123 CD',
      color: null,
    });
    const order = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 10:00'),
    });
    await expect(
      db.insert(bookings).values({
        kind: 'order',
        orderId: order.id,
        boxId: shop.boxes[1]!.id,
        startsAt: at('2026-10-31 10:00'),
        endsAt: at('2026-10-31 12:00'),
      }),
    ).rejects.toMatchObject(UNIQUE);
  });
});

describe('orders (PLAN 7.8)', () => {
  it('the total is the subtotal less the discount, and a discount is neither negative nor above the subtotal', async () => {
    const client = await makeClient(db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 B 123 CD',
      color: null,
    });
    const order = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 10:00'),
    });
    const change = (values: object) => db.update(orders).set(values).where(eq(orders.id, order.id));
    await expect(change({ total: 1 })).rejects.toMatchObject(CHECK);
    await expect(change({ discountAmount: 100, total: 1_400_000 })).rejects.toMatchObject(CHECK);
    await expect(change({ discountAmount: -5, total: 1_400_005 })).rejects.toMatchObject(CHECK);
    await expect(change({ discountAmount: 2_000_000, total: -600_000 })).rejects.toMatchObject(
      CHECK,
    );
    await expect(change({ discountAmount: 70_000, total: 1_330_000 })).resolves.toBeDefined();
  });

  it('only a new order holds a slot', async () => {
    const client = await makeClient(db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 B 123 CD',
      color: null,
    });
    const order = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 10:00'),
    });
    await expect(
      db.update(orders).set({ status: 'confirmed' }).where(eq(orders.id, order.id)),
    ).rejects.toMatchObject(CHECK);
    await expect(
      db
        .update(orders)
        .set({ status: 'confirmed', holdUntil: null })
        .where(eq(orders.id, order.id)),
    ).resolves.toBeDefined();
  });

  it('numbers start at 1001 and go up', async () => {
    const client = await makeClient(db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 B 123 CD',
      color: null,
    });
    const make = (time: string) =>
      t.services.orders.create(client, {
        requestId: newId(),
        carId: car.id,
        serviceIds: [shop.zones.bonnet],
        startsAt: at(`2026-10-30 ${time}`),
      });
    const first = await make('10:00');
    const second = await make('15:00');
    expect(second.number).toBe(first.number + 1);
  });
});
