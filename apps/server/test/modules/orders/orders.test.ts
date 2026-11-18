import type { NewOrder } from '../../../src/modules/orders/app/orders';
import type { ClientActor } from '../../../src/platform/actors';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bookings,
  cancelReasons,
  orderItems,
  orders,
  outbox,
  statusHistory,
} from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import { useTestDatabase } from '../../helpers/db';
import { createTestServices, type TestContext } from '../../helpers/services';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase({ maxConnections: 10 });
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const orderService = () => t.services.orders;
const garage = () => t.services.garage;

/** A client with a car of the given model (Tracker 2, class M, unless told otherwise). */
async function clientWithCar(model: string = shop.models.tracker) {
  const client = await makeClient(database.db);
  const car = await garage().create(client, {
    modelId: model,
    customModelText: null,
    bodyClass: null,
    year: 2022,
    plate: `01${Math.floor(Math.random() * 900 + 100)}ABC`,
    color: null,
  });
  return { client, car };
}

const FRIDAY_10 = at('2026-10-30 10:00');

function place(client: ClientActor, carId: string, overrides: Partial<NewOrder> = {}) {
  return orderService().create(client, {
    requestId: newId(),
    carId,
    serviceIds: [shop.zones.bonnet],
    startsAt: FRIDAY_10,
    comment: null,
    ...overrides,
  });
}

const allOutbox = () => database.db.select().from(outbox);
const typeOf = (row: { payload: unknown }) =>
  (row.payload as { notification: { type: string } }).notification.type;
const activeBookings = () => database.db.select().from(bookings).where(isNull(bookings.releasedAt));

describe('placing an order (PLAN 10.4)', () => {
  it('prices it from the price list, holds a box and the slot, and tells the client and the staff', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id, { comment: 'Kech qolmayman' });

    expect(order).toMatchObject({
      status: 'new',
      subtotal: 1_400_000,
      total: 1_400_000,
      unpricedCount: 0,
      comment: 'Kech qolmayman',
      boxName: '1-boks',
      car: { plate: car.plate },
      canCancel: true,
      canRequestReschedule: true,
      rescheduleRequested: false,
    });
    expect(order.number).toBeGreaterThanOrEqual(1001);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ nameUz: 'Kapot', price: 1_400_000, durationMin: 120 });
    // 120 minutes of work and the 15-minute buffer from 10:00.
    expect(order.startsAt).toMatchObject({ date: '2026-10-30', time: '10:00' });
    expect(order.endsAt).toMatchObject({ date: '2026-10-30', time: '12:15' });
    // Now is Thursday 10:00; the hold is two working hours.
    expect(order.holdUntil).toMatchObject({ date: '2026-10-29', time: '12:00' });
    expect(order.history.map((step) => step.status)).toEqual(['new']);
  });

  it('writes the order, its history and the messages in one go: one to the client, one to each admin', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);

    const history = await database.db.select().from(statusHistory);
    expect(history).toMatchObject([
      {
        entity: 'order',
        entityId: order.id,
        fromStatus: null,
        toStatus: 'new',
        actorId: client.userId,
      },
    ]);

    const messages = await allOutbox();
    expect(messages.map(typeOf).sort()).toEqual([
      'order.created',
      'staff.order_new',
      'staff.order_new',
    ]);
    const toClient = messages.find((row) => row.recipientId === client.userId);
    expect(toClient).toMatchObject({ status: 'pending' });
    expect(toClient?.payload).toMatchObject({
      lang: 'uz',
      notification: { type: 'order.created', number: order.number, total: 1_400_000 },
    });
  });

  it('copies names, prices and times into the order, so the price list changing later does not touch it', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);

    await t.services.catalog.services.updatePrices(shop.owner, shop.ceramicId, [
      { serviceId: shop.zones.bonnet, bodyClass: 'M', price: 9_999_999, durationMin: 400 },
    ]);
    const [item] = await database.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    expect(item).toMatchObject({
      price: 1_400_000,
      durationMin: 120,
      nameUz: 'Kapot',
      bodyClass: 'M',
    });
    expect(await orderService().get(client, order.id)).toMatchObject({ total: 1_400_000 });
    // A new quote does see the new price.
    expect(
      await orderService().quote(client, { carId: car.id, serviceIds: [shop.zones.bonnet] }),
    ).toMatchObject({ subtotal: 9_999_999 });
  });

  it('the same request twice is one order, one booking and one set of messages', async () => {
    const { client, car } = await clientWithCar();
    const requestId = newId();
    const first = await place(client, car.id, { requestId });
    const again = await place(client, car.id, { requestId });

    expect(again.id).toBe(first.id);
    expect(await database.db.select().from(orders)).toHaveLength(1);
    expect(await activeBookings()).toHaveLength(1);
    expect(await allOutbox()).toHaveLength(3);
  });

  it('the same request arriving at once is still one order', async () => {
    const { client, car } = await clientWithCar();
    const requestId = newId();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => place(client, car.id, { requestId })),
    );
    expect(new Set(results.map((order) => order.id)).size).toBe(1);
    expect(await database.db.select().from(orders)).toHaveLength(1);
    expect(await activeBookings()).toHaveLength(1);
  });

  it('a request key belongs to its client: another client with the same key gets their own order', async () => {
    const a = await clientWithCar();
    const b = await clientWithCar();
    const requestId = newId();
    const first = await place(a.client, a.car.id, { requestId });
    const second = await place(b.client, b.car.id, { requestId, startsAt: at('2026-10-30 15:00') });
    expect(second.id).not.toBe(first.id);
  });

  it('the first box is held first; the second takes the next client; then the time is taken', async () => {
    const [a, b, c] = [await clientWithCar(), await clientWithCar(), await clientWithCar()];
    expect((await place(a.client, a.car.id)).boxName).toBe('1-boks');
    expect((await place(b.client, b.car.id)).boxName).toBe('2-boks');
    await expect(place(c.client, c.car.id)).rejects.toMatchObject({ code: 'slot_taken' });
    // The refused order left nothing behind.
    expect(await database.db.select().from(orders)).toHaveLength(2);
    expect(await allOutbox()).toHaveLength(6);
  });

  it('a hundred clients after one time: exactly as many orders as there are boxes', async () => {
    const people = await Promise.all(Array.from({ length: 100 }, () => clientWithCar()));
    const results = await Promise.allSettled(
      people.map(({ client, car }) => place(client, car.id)),
    );

    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter(
      (result) =>
        result.status === 'rejected' && (result.reason as { code?: string }).code === 'slot_taken',
    );
    expect(won).toHaveLength(2);
    expect(lost).toHaveLength(98);
    expect(await database.db.select().from(orders)).toHaveLength(2);
    expect(await activeBookings()).toHaveLength(2);
  });

  it('a start the workshop does not offer is refused', async () => {
    const { client, car } = await clientWithCar();
    const refused = (startsAt: Date) =>
      expect(place(client, car.id, { startsAt })).rejects.toMatchObject({
        code: 'slot_unavailable',
      });
    await refused(at('2026-10-30 10:10')); // off the step grid
    await refused(at('2026-10-30 13:00')); // in the break
    await refused(at('2026-10-30 19:00')); // would not be done before closing
    await refused(at('2026-10-29 11:00')); // sooner than the two-hour lead
    await refused(at('2026-11-01 10:00')); // Sunday
    await refused(at('2026-12-30 10:00')); // beyond the horizon
    expect(await database.db.select().from(orders)).toHaveLength(0);
  });

  it('the earliest start is exactly the lead time from now', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id, { startsAt: at('2026-10-29 12:00') });
    expect(order.startsAt).toMatchObject({ date: '2026-10-29', time: '12:00' });
  });

  it('without a verified phone, no price, no times and no order', async () => {
    const stranger = await makeClient(database.db, { phoneVerified: false });
    const { car } = await clientWithCar();
    const input = { carId: car.id, serviceIds: [shop.zones.bonnet] };
    await expect(orderService().quote(stranger, input)).rejects.toMatchObject({
      code: 'phone_required',
    });
    await expect(orderService().availability(stranger, input)).rejects.toMatchObject({
      code: 'phone_required',
    });
    await expect(place(stranger, car.id)).rejects.toMatchObject({ code: 'phone_required' });
  });

  it('only the client’s own car: somebody else’s is not found', async () => {
    const owner = await clientWithCar();
    const stranger = await makeClient(database.db);
    await expect(place(stranger, owner.car.id)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('what may be ordered', () => {
  it('"whole body" cannot be ordered together with a panel it covers', async () => {
    const { client, car } = await clientWithCar();
    await expect(
      orderService().quote(client, {
        carId: car.id,
        serviceIds: [shop.zones.full, shop.zones.bonnet],
      }),
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      details: { paths: ['body.serviceIds'] },
    });
  });

  it('a zone with no price for the car’s class is not offered', async () => {
    // The bumper has a price for class M only.
    const { client, car } = await clientWithCar(shop.models.onixS);
    await expect(
      orderService().quote(client, { carId: car.id, serviceIds: [shop.zones.bumper] }),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
  });

  it('prices follow the car’s class', async () => {
    const small = await clientWithCar(shop.models.onixS);
    const medium = await clientWithCar();
    const quote = (c: typeof small) =>
      orderService().quote(c.client, { carId: c.car.id, serviceIds: [shop.zones.bonnet] });
    expect(await quote(small)).toMatchObject({ subtotal: 1_200_000, workMinutes: 100 });
    expect(await quote(medium)).toMatchObject({ subtotal: 1_400_000, workMinutes: 120 });
  });

  it('a zone that does not exist, or is hidden, is refused', async () => {
    const { client, car } = await clientWithCar();
    await expect(
      orderService().quote(client, { carId: car.id, serviceIds: [newId()] }),
    ).rejects.toMatchObject({ code: 'validation' });
    await t.services.catalog.services.updateService(shop.owner, shop.zones.bonnet, {
      isActive: false,
    });
    await expect(
      orderService().quote(client, { carId: car.id, serviceIds: [shop.zones.bonnet] }),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
  });

  it('a zone with no price is in the quote but not in the total', async () => {
    const { client, car } = await clientWithCar();
    const input = { carId: car.id, serviceIds: [shop.zones.bonnet, shop.zones.other] };
    expect(await orderService().quote(client, input)).toMatchObject({
      subtotal: 1_400_000,
      unpricedCount: 1,
      workMinutes: 210,
      bufferMin: 15,
      totalMinutes: 225,
      multiDay: false,
    });
    const order = await place(client, car.id, { serviceIds: input.serviceIds });
    expect(order).toMatchObject({ subtotal: 1_400_000, total: 1_400_000, unpricedCount: 1 });
    const messages = await allOutbox();
    expect(messages[0]?.payload).toMatchObject({ notification: { hasUnpriced: true } });
  });

  it('a job longer than a working day: the client picks the day, and the box is held for days', async () => {
    const { client, car } = await clientWithCar();
    const input = { carId: car.id, serviceIds: [shop.zones.full] };
    expect(await orderService().quote(client, input)).toMatchObject({ multiDay: true });

    const friday = await orderService().slots(client, { ...input, date: '2026-10-30' });
    expect(friday.multiDay).toBe(true);
    expect(friday.slots).toHaveLength(1);
    expect(friday.slots[0]).toMatchObject({ free: true, startsAt: { time: '09:00' } });

    const order = await place(client, car.id, {
      serviceIds: [shop.zones.full],
      startsAt: at('2026-10-30 09:00'),
    });
    // 1 500 + 15 working minutes: Friday 600, Saturday 360, and the rest on Monday after the break.
    expect(order.endsAt).toMatchObject({ date: '2026-11-02', time: '19:15' });
  });
});

describe('free times for the client', () => {
  it('each day is free, full or closed; today is past the lead time at 10:00', async () => {
    const { client, car } = await clientWithCar();
    const { days, multiDay } = await orderService().availability(client, {
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
    });
    expect(multiDay).toBe(false);
    expect(days).toHaveLength(30);
    expect(days[0]).toMatchObject({ date: '2026-10-29', state: 'free' });
    expect(days.find((day) => day.date === '2026-11-01')).toMatchObject({
      state: 'closed',
      closedReason: 'day_off',
    });
  });

  it('a booked time is no longer free, and a day with everything taken is full with the nearest times offered', async () => {
    const { client, car } = await clientWithCar();
    const input = { carId: car.id, serviceIds: [shop.zones.bonnet] };
    const free = await orderService().slots(client, { ...input, date: '2026-10-30' });
    expect(free.slots.find((slot) => slot.startsAt.time === '10:00')).toMatchObject({
      free: true,
      boxName: '1-boks',
    });

    // Both boxes held for the whole of Friday.
    for (const box of shop.boxes) {
      await database.db.insert(bookings).values({
        kind: 'block',
        boxId: box.id,
        startsAt: at('2026-10-30 09:00'),
        endsAt: at('2026-10-30 20:00'),
        note: 'ta’mir',
      });
    }
    const full = await orderService().slots(client, { ...input, date: '2026-10-30' });
    expect(full.slots.every((slot) => !slot.free)).toBe(true);
    expect(full.nearest).toHaveLength(3);
    expect(full.nearest[0]?.startsAt.date).toBe('2026-10-31');
    const { days } = await orderService().availability(client, input);
    expect(days.find((day) => day.date === '2026-10-30')?.state).toBe('full');
  });
});

describe('tracking and cancelling (PLAN 8, 9.1)', () => {
  it('the list has the active orders and the history apart; nobody sees another client’s', async () => {
    const { client, car } = await clientWithCar();
    const stranger = await makeClient(database.db);
    const order = await place(client, car.id);

    expect((await orderService().list(client, 'active')).map((o) => o.id)).toEqual([order.id]);
    expect(await orderService().list(client, 'history')).toEqual([]);
    expect(await orderService().list(stranger, 'active')).toEqual([]);
    await expect(orderService().get(stranger, order.id)).rejects.toMatchObject({
      code: 'not_found',
    });

    await database.db.update(orders).set({ status: 'completed', holdUntil: null });
    expect(await orderService().list(client, 'active')).toEqual([]);
    expect((await orderService().list(client, 'history')).map((o) => o.status)).toEqual([
      'completed',
    ]);
  });

  async function reasonId(code: string) {
    const [reason] = await database.db
      .select()
      .from(cancelReasons)
      .where(eq(cancelReasons.code, code));
    return reason!.id;
  }

  it('the client cancels with a reason: the box is given back and the staff are told', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const cancelled = await orderService().cancel(client, order.id, {
      reasonId: await reasonId('too_expensive'),
    });

    expect(cancelled).toMatchObject({ status: 'cancelled', canCancel: false, holdUntil: null });
    expect(cancelled.history.map((step) => step.status)).toEqual(['new', 'cancelled']);
    expect(await activeBookings()).toHaveLength(0);

    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ cancelledBy: client.userId, holdUntil: null });
    expect(row?.cancelReasonId).toBe(await reasonId('too_expensive'));

    const cancels = (await allOutbox()).filter((m) => typeOf(m) === 'staff.client_cancelled');
    expect(cancels).toHaveLength(2);
    expect(cancels[0]?.payload).toMatchObject({
      notification: { reason: { uz: 'Qimmat', ru: 'Дорого' }, clientName: 'Aziz Karimov' },
    });

    // The time is free for somebody else again.
    const other = await clientWithCar();
    await expect(place(other.client, other.car.id)).resolves.toMatchObject({ boxName: '1-boks' });
  });

  it('only a reason meant for clients, and a few words when the reason asks for them', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);

    await expect(
      orderService().cancel(client, order.id, { reasonId: await reasonId('cannot_perform') }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.reasonId'] } });
    await expect(
      orderService().cancel(client, order.id, { reasonId: await reasonId('no_contact') }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      orderService().cancel(client, order.id, { reasonId: await reasonId('other'), note: '  ' }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.note'] } });
    expect(await orderService().get(client, order.id)).toMatchObject({ status: 'new' });

    const done = await orderService().cancel(client, order.id, {
      reasonId: await reasonId('other'),
      note: 'Mashina sotildi',
    });
    expect(done.status).toBe('cancelled');
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.cancelNote).toBe('Mashina sotildi');
  });

  it('a confirmed order may be cancelled too; one in work, or already cancelled, may not', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const reason = await reasonId('changed_mind');
    await database.db.update(orders).set({ status: 'confirmed', holdUntil: null });
    await expect(
      orderService().cancel(client, order.id, { reasonId: reason }),
    ).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expect(
      orderService().cancel(client, order.id, { reasonId: reason }),
    ).rejects.toMatchObject({
      code: 'invalid_transition',
    });

    const next = await place(client, (await clientWithCar()).car.id).catch(() => null);
    expect(next).toBeNull(); // somebody else's car: not found
  });

  it.each(['in_work', 'ready_for_pickup', 'completed', 'no_show'] as const)(
    'an order that is %s cannot be cancelled by the client, and keeps its box',
    async (status) => {
      const { client, car } = await clientWithCar();
      const order = await place(client, car.id);
      await database.db.update(orders).set({ status, holdUntil: null });
      await expect(
        orderService().cancel(client, order.id, { reasonId: await reasonId('changed_mind') }),
      ).rejects.toMatchObject({ code: 'invalid_transition' });
      expect(await activeBookings()).toHaveLength(1);
    },
  );

  it('somebody else’s order cannot be cancelled: it is not found', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const stranger = await makeClient(database.db);
    await expect(
      orderService().cancel(stranger, order.id, { reasonId: await reasonId('changed_mind') }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(orderService().requestReschedule(stranger, order.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('the client asks to move the time once, and the admins are told', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const asked = await orderService().requestReschedule(client, order.id);
    expect(asked).toMatchObject({
      rescheduleRequested: true,
      canRequestReschedule: false,
      status: 'new',
    });
    expect(
      (await allOutbox()).filter((m) => typeOf(m) === 'staff.reschedule_requested'),
    ).toHaveLength(2);

    await expect(orderService().requestReschedule(client, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    expect(
      (await allOutbox()).filter((m) => typeOf(m) === 'staff.reschedule_requested'),
    ).toHaveLength(2);
  });

  it('a car with an order in progress cannot be archived, and can once the order is cancelled', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await expect(garage().archive(client, car.id)).rejects.toMatchObject({
      code: 'car_has_active_orders',
    });
    await orderService().cancel(client, order.id, { reasonId: await reasonId('changed_mind') });
    await expect(garage().archive(client, car.id)).resolves.toBeUndefined();
  });
});

describe('cancelling what nobody called about (PLAN 10.4)', () => {
  const advance = (local: string) => t.clock.set(at(local));

  it('a new order is cancelled once its hold has run out: the box is free and the client is told, once', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);

    advance('2026-10-29 11:59');
    expect(await orderService().expireHolds(t.clock.now())).toBe(0);
    advance('2026-10-29 12:00');
    expect(await orderService().expireHolds(t.clock.now())).toBe(1);
    expect(await orderService().expireHolds(t.clock.now())).toBe(0);

    expect(await orderService().get(client, order.id)).toMatchObject({
      status: 'cancelled',
      holdUntil: null,
    });
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    const [noContact] = await database.db
      .select()
      .from(cancelReasons)
      .where(eq(cancelReasons.code, 'no_contact'));
    expect(row).toMatchObject({ cancelledBy: null, cancelReasonId: noContact?.id });
    expect(await activeBookings()).toHaveLength(0);

    const history = await database.db
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entityId, order.id), eq(statusHistory.toStatus, 'cancelled')));
    expect(history).toMatchObject([{ actorId: null, fromStatus: 'new', reasonId: noContact?.id }]);

    const told = (await allOutbox()).filter((m) => typeOf(m) === 'order.cancelled');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: client.userId });
    expect(told[0]?.payload).toMatchObject({
      notification: { reason: { uz: 'Aloqa bo‘lmadi' }, number: order.number },
    });
  });

  it('the freed time can be booked by somebody else', async () => {
    const first = await clientWithCar();
    const second = await clientWithCar();
    const third = await clientWithCar();
    await place(first.client, first.car.id);
    await place(second.client, second.car.id);
    await expect(place(third.client, third.car.id)).rejects.toMatchObject({ code: 'slot_taken' });

    advance('2026-10-29 12:00');
    await orderService().expireHolds(t.clock.now());
    advance('2026-10-29 12:30');
    await expect(place(third.client, third.car.id)).resolves.toMatchObject({ status: 'new' });
  });

  it('an order whose slot begins before its hold would end is left alone: the client may be on the way', async () => {
    const { client, car } = await clientWithCar();
    // The earliest slot, two hours from now, is where the hold ends too.
    const order = await place(client, car.id, { startsAt: at('2026-10-29 12:00') });
    advance('2026-10-29 13:00');
    expect(await orderService().expireHolds(t.clock.now())).toBe(0);
    expect(await orderService().get(client, order.id)).toMatchObject({ status: 'new' });
  });

  it('an order booked at night is held from the morning', async () => {
    const { client, car } = await clientWithCar();
    advance('2026-10-29 23:00');
    const order = await place(client, car.id, { startsAt: at('2026-11-03 10:00') });
    expect(order.holdUntil).toMatchObject({ date: '2026-10-30', time: '11:00' });
    advance('2026-10-30 10:00');
    expect(await orderService().expireHolds(t.clock.now())).toBe(0);
    advance('2026-10-30 11:00');
    expect(await orderService().expireHolds(t.clock.now())).toBe(1);
  });

  it('a confirmed order is never cancelled by it', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await database.db.update(orders).set({ status: 'confirmed', holdUntil: null });
    advance('2026-10-30 09:00');
    expect(await orderService().expireHolds(t.clock.now())).toBe(0);
    expect(await orderService().get(client, order.id)).toMatchObject({ status: 'confirmed' });
  });
});
