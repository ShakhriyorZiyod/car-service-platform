import type { ClientActor, StaffActor } from '../../../src/platform/actors';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  auditLog,
  bookings,
  cancelReasons,
  orderCalls,
  orders,
  outbox,
  statusHistory,
  users,
} from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import type { NewOrder } from '../../../src/modules/orders/app/orders';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase({ maxConnections: 10 });
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const admin = () => t.services.adminOrders;
const FRIDAY_10 = at('2026-10-30 10:00');

async function clientWithCar(options: { telegram?: boolean; name?: string } = {}) {
  const client = await makeClient(database.db, options);
  const car = await t.services.garage.create(client, {
    modelId: shop.models.tracker,
    customModelText: null,
    bodyClass: null,
    year: 2022,
    plate: `01${Math.floor(Math.random() * 900 + 100)}ABC`,
    color: null,
  });
  return { client, car };
}

/** The client's own request, as the Mini App makes it. */
function place(client: ClientActor, carId: string, overrides: Partial<NewOrder> = {}) {
  return t.services.orders.create(client, {
    requestId: newId(),
    carId,
    serviceIds: [shop.zones.bonnet],
    startsAt: FRIDAY_10,
    comment: null,
    ...overrides,
  });
}

async function director(): Promise<StaffActor> {
  return staffActorOf(await insertStaff(database.db, ['director']), ['director']);
}

const messages = () => database.db.select().from(outbox).orderBy(asc(outbox.createdAt));
const typeOf = (row: { payload: unknown }) =>
  (row.payload as { notification: { type: string } }).notification.type;
const ofType = async (type: string) => (await messages()).filter((row) => typeOf(row) === type);
const reasonId = async (code: string) =>
  (await database.db.select().from(cancelReasons).where(eq(cancelReasons.code, code)))[0]!.id;
const activeBookings = () => database.db.select().from(bookings).where(isNull(bookings.releasedAt));
const advance = (local: string) => t.clock.set(at(local));

describe('who may work with orders (PLAN 8)', () => {
  it('the director reads and cannot write', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const boss = await director();

    expect(await admin().get(boss, order.id)).toMatchObject({ number: order.number });
    expect(await admin().list(boss, {})).toHaveLength(1);
    const refused = { code: 'forbidden' };
    await expect(admin().call(boss, order.id, { outcome: 'confirmed' })).rejects.toMatchObject(
      refused,
    );
    await expect(
      admin().cancel(boss, order.id, { reasonId: await reasonId('duplicate') }),
    ).rejects.toMatchObject(refused);
    await expect(admin().noShow(boss, order.id)).rejects.toMatchObject(refused);
    await expect(admin().reschedule(boss, order.id, at('2026-10-30 15:00'))).rejects.toMatchObject(
      refused,
    );
    await expect(
      admin().updateItems(boss, order.id, [{ serviceId: shop.zones.bumper }]),
    ).rejects.toMatchObject(refused);
    await expect(
      admin().create(boss, {
        clientId: client.userId,
        carId: car.id,
        serviceIds: [shop.zones.bonnet],
        startsAt: FRIDAY_10,
        source: 'phone',
        confirmedByClient: true,
      }),
    ).rejects.toMatchObject(refused);
    expect(await admin().get(shop.admin, order.id)).toMatchObject({ status: 'new' });
  });

  it('the director is shown no buttons: the server says what may be done, and they may do nothing', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    expect((await admin().get(await director(), order.id)).actions).toEqual({
      canCall: false,
      canEditItems: false,
      canReschedule: false,
      canCancel: false,
      canNoShow: false,
      canDiscount: false,
      canPriceItems: false,
      canCheckout: false,
    });
    expect((await admin().get(shop.admin, order.id)).actions.canCall).toBe(true);
  });

  it('a master sees nothing of the orders', async () => {
    const master = staffActorOf(await insertStaff(database.db, ['master']), ['master']);
    await expect(admin().list(master, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(admin().today(master)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('the call (PLAN 9.1, 10.4)', () => {
  it('"confirmed": the order is confirmed, the hold ends, the client is told once', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const done = await admin().call(shop.admin, order.id, { outcome: 'confirmed' });

    expect(done).toMatchObject({ status: 'confirmed', holdUntil: null, waitingMin: null });
    expect(done.calls).toMatchObject([{ outcome: 'confirmed', adminName: 'Test User' }]);
    expect(done.history.map((step) => step.status)).toEqual(['new', 'confirmed']);
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ confirmedBy: shop.admin.userId, holdUntil: null });
    expect(row?.confirmedAt).toEqual(t.clock.now());

    const told = await ofType('order.confirmed');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: client.userId });
  });

  it('"no answer" holds the slot longer and the order stays new', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    expect(order.holdUntil).toMatchObject({ date: '2026-10-29', time: '12:00' });

    advance('2026-10-29 11:00');
    const done = await admin().call(shop.admin, order.id, {
      outcome: 'no_answer',
      note: 'Telefon o‘chiq',
    });
    // A day from now, later than the old hold.
    expect(done).toMatchObject({
      status: 'new',
      holdUntil: { date: '2026-10-30', time: '11:00' },
      calls: [{ outcome: 'no_answer', note: 'Telefon o‘chiq' }],
    });
    // It was called, so it no longer counts as waiting for a call.
    expect(done.waitingMin).toBeNull();
    expect(await ofType('order.confirmed')).toHaveLength(0);
  });

  it('"no answer" never shortens a hold that is already longer', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    advance('2026-10-29 11:00');
    await admin().call(shop.admin, order.id, { outcome: 'no_answer' });
    advance('2026-10-29 11:05');
    // The second "no answer" would end at 11:05 + 24 h, which is later: it moves on.
    const again = await admin().call(shop.admin, order.id, { outcome: 'no_answer' });
    expect(again.holdUntil).toMatchObject({ date: '2026-10-30', time: '11:05' });
    expect(again.calls).toHaveLength(2);
  });

  it('"rejected" needs a reason, cancels the order, gives the box back and tells the client why', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);

    await expect(admin().call(shop.admin, order.id, { outcome: 'rejected' })).rejects.toMatchObject(
      {
        code: 'validation',
        details: { paths: ['body.reasonId'] },
      },
    );
    // The system's own reason is not for a person to pick.
    await expect(
      admin().call(shop.admin, order.id, {
        outcome: 'rejected',
        reasonId: await reasonId('no_contact'),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      admin().call(shop.admin, order.id, {
        outcome: 'rejected',
        reasonId: await reasonId('other'),
      }),
    ).rejects.toMatchObject({ details: { paths: ['body.note'] } });
    expect(await admin().get(shop.admin, order.id)).toMatchObject({ status: 'new' });
    expect(await database.db.select().from(orderCalls)).toHaveLength(0);

    const done = await admin().call(shop.admin, order.id, {
      outcome: 'rejected',
      reasonId: await reasonId('cannot_perform'),
    });
    expect(done).toMatchObject({
      status: 'cancelled',
      cancelReason: { uz: 'Servis bajara olmaydi' },
      calls: [{ outcome: 'rejected' }],
    });
    expect(await activeBookings()).toHaveLength(0);
    const told = await ofType('order.cancelled');
    expect(told).toHaveLength(1);
    expect(told[0]?.payload).toMatchObject({
      notification: { reason: { uz: 'Servis bajara olmaydi' } },
    });
  });

  it('only a new order can be called about', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await admin().call(shop.admin, order.id, { outcome: 'confirmed' });
    for (const outcome of ['confirmed', 'no_answer'] as const) {
      await expect(admin().call(shop.admin, order.id, { outcome })).rejects.toMatchObject({
        code: 'invalid_transition',
      });
    }
    await expect(
      admin().call(shop.admin, order.id, {
        outcome: 'rejected',
        reasonId: await reasonId('duplicate'),
      }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    expect(await database.db.select().from(orderCalls)).toHaveLength(1);
  });

  it('a client without Telegram is not written to, and nothing fails', async () => {
    const { client, car } = await clientWithCar({ telegram: false });
    const order = await place(client, car.id);
    await expect(
      admin().call(shop.admin, order.id, { outcome: 'confirmed' }),
    ).resolves.toMatchObject({
      status: 'confirmed',
      client: { hasTelegram: false },
    });
    expect(await ofType('order.confirmed')).toHaveLength(0);
  });
});

describe('"no show" (design A1)', () => {
  it('only once the slot has begun', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await admin().call(shop.admin, order.id, { outcome: 'confirmed' });

    advance('2026-10-30 09:59');
    await expect(admin().noShow(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    expect(await activeBookings()).toHaveLength(1);

    advance('2026-10-30 10:00');
    const done = await admin().noShow(shop.admin, order.id);
    expect(done).toMatchObject({ status: 'no_show' });
    expect(await activeBookings()).toHaveLength(0);
    const history = await database.db
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entityId, order.id), eq(statusHistory.toStatus, 'no_show')));
    expect(history).toMatchObject([{ fromStatus: 'confirmed', actorId: shop.admin.userId }]);
  });

  it('not for an order that was never confirmed', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    advance('2026-10-31 12:00');
    await expect(admin().noShow(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });
});

describe('moving the time (PLAN 10.4)', () => {
  it('moves the booking, tells the client and clears their request to move', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await t.services.orders.requestReschedule(client, order.id);

    const moved = await admin().reschedule(shop.admin, order.id, at('2026-10-30 15:00'));
    expect(moved).toMatchObject({
      startsAt: { date: '2026-10-30', time: '15:00' },
      endsAt: { time: '17:15' },
      rescheduleRequested: false,
    });
    expect(await activeBookings()).toHaveLength(1);

    const told = await ofType('order.rescheduled');
    expect(told).toHaveLength(1);
    expect(told[0]?.payload).toMatchObject({
      notification: {
        startsAt: { date: '2026-10-30', time: '15:00' },
        previousStartsAt: { date: '2026-10-30', time: '10:00' },
      },
    });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'order.reschedule')),
    ).toHaveLength(1);
  });

  it('a time that is held: slot_taken, and the old time stays', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    for (let i = 0; i < 2; i += 1) {
      const other = await clientWithCar();
      await place(other.client, other.car.id, { startsAt: at('2026-10-30 15:00') });
    }

    await expect(
      admin().reschedule(shop.admin, order.id, at('2026-10-30 15:00')),
    ).rejects.toMatchObject({ code: 'slot_taken' });
    const kept = await admin().get(shop.admin, order.id);
    expect(kept.startsAt).toMatchObject({ date: '2026-10-30', time: '10:00' });
    const mine = (await activeBookings()).filter((row) => row.orderId === order.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.startsAt).toEqual(FRIDAY_10);
    expect(await ofType('order.rescheduled')).toHaveLength(0);
  });

  it('may overlap its own old time: half an hour later is fine', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const moved = await admin().reschedule(shop.admin, order.id, at('2026-10-30 10:30'));
    expect(moved.startsAt.time).toBe('10:30');
  });

  it('the staff may book sooner than the clients’ lead time, but only a time the workshop offers', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    // Now is 10:00 on Thursday: a client could not take 10:30, the staff may.
    expect(
      (await admin().reschedule(shop.admin, order.id, at('2026-10-29 10:30'))).startsAt.time,
    ).toBe('10:30');
    for (const bad of [
      '2026-10-29 10:10',
      '2026-10-29 13:00',
      '2026-11-01 10:00',
      '2026-12-30 10:00',
    ]) {
      await expect(admin().reschedule(shop.admin, order.id, at(bad))).rejects.toMatchObject({
        code: 'slot_unavailable',
      });
    }
  });

  it('not once the work has started or the order is closed', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    for (const status of [
      'in_work',
      'ready_for_pickup',
      'completed',
      'cancelled',
      'no_show',
    ] as const) {
      await database.db.update(orders).set({ status, holdUntil: null });
      await expect(
        admin().reschedule(shop.admin, order.id, at('2026-10-30 15:00')),
      ).rejects.toMatchObject({ code: 'invalid_transition' });
    }
  });
});

describe('what the staff are offered (PLAN 10.4)', () => {
  it('times sooner than the clients’ lead time are offered to the staff, never past ones', async () => {
    const { client, car } = await clientWithCar();
    const query = { bodyClass: 'M' as const, serviceIds: [shop.zones.bonnet], date: '2026-10-29' };
    const hours = (slots: { startsAt: { time: string }; free: boolean }[]) =>
      slots.filter((slot) => slot.free).map((slot) => slot.startsAt.time);

    // It is 10:00 on Thursday; the clients' lead time is 60 minutes.
    const forClient = await t.services.orders.slots(client, {
      carId: car.id,
      ...query,
      serviceIds: query.serviceIds,
    });
    expect(hours(forClient.slots)).not.toContain('10:30');
    const forStaff = await admin().slots(shop.admin, query);
    expect(hours(forStaff.slots)).toContain('10:30');
    expect(hours(forStaff.slots)).not.toContain('09:30');
    const days = await admin().availability(shop.admin, {
      bodyClass: 'M',
      serviceIds: [shop.zones.bonnet],
    });
    expect(days.days[0]).toMatchObject({ date: '2026-10-29', state: 'free' });
  });
});

describe('changing the zones and prices (PLAN 10.4, 11)', () => {
  it('adds a zone at the price list’s price and lengthens the booking from the same start', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const done = await admin().updateItems(shop.admin, order.id, [
      { serviceId: shop.zones.bonnet },
      { serviceId: shop.zones.bumper },
    ]);
    expect(done).toMatchObject({
      subtotal: 3_000_000,
      total: 3_000_000,
      startsAt: { time: '10:00' },
    });
    // 120 + 150 + 15 working minutes from 10:00, across the break.
    expect(done.endsAt.time).toBe('15:45');
    expect(done.items.map((item) => item.nameUz).sort()).toEqual(['Kapot', 'Old bamper']);
    expect(await activeBookings()).toHaveLength(1);
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'order.items.update')),
    ).toHaveLength(1);
  });

  it('a zone already in the order keeps the price it was sold at, whatever the list says now', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await t.services.catalog.services.updatePrices(shop.owner, shop.ceramicId, [
      { serviceId: shop.zones.bonnet, bodyClass: 'M', price: 9_999_999, durationMin: 400 },
      { serviceId: shop.zones.bumper, bodyClass: 'M', price: 1_600_000, durationMin: 150 },
    ]);
    const done = await admin().updateItems(shop.admin, order.id, [
      { serviceId: shop.zones.bonnet },
      { serviceId: shop.zones.bumper },
    ]);
    const price = (name: string) => done.items.find((item) => item.nameUz === name)?.price;
    expect(price('Kapot')).toBe(1_400_000);
    expect(price('Old bamper')).toBe(1_600_000);
  });

  it('a price typed by the admin wins, and "to be agreed" stays out of the total', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    const done = await admin().updateItems(shop.admin, order.id, [
      { serviceId: shop.zones.bonnet, price: 1_000_000, comment: 'Chegirma bilan' },
      { serviceId: shop.zones.other },
    ]);
    expect(done).toMatchObject({ subtotal: 1_000_000, total: 1_000_000, unpricedCount: 1 });
    expect(done.items.find((item) => item.nameUz === 'Kapot')).toMatchObject({
      price: 1_000_000,
      comment: 'Chegirma bilan',
    });
  });

  it('removes a zone and shortens the booking', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id, {
      serviceIds: [shop.zones.bonnet, shop.zones.bumper],
    });
    expect(order.endsAt.time).toBe('15:45');
    const done = await admin().updateItems(shop.admin, order.id, [
      { serviceId: shop.zones.bonnet },
    ]);
    expect(done).toMatchObject({ subtotal: 1_400_000, endsAt: { time: '12:15' } });
    expect(done.items).toHaveLength(1);
  });

  it('a combination that contradicts itself is refused', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await expect(
      admin().updateItems(shop.admin, order.id, [
        { serviceId: shop.zones.full },
        { serviceId: shop.zones.bonnet },
      ]),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
    await expect(
      admin().updateItems(shop.admin, order.id, [
        { serviceId: shop.zones.bonnet },
        { serviceId: shop.zones.bonnet },
      ]),
    ).rejects.toMatchObject({ code: 'validation' });
    expect((await admin().get(shop.admin, order.id)).items).toHaveLength(1);
  });

  it('when the longer job no longer fits, slot_taken and nothing changes', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    // A block right where the longer job would run, in both boxes.
    await t.services.schedule.createBlock(shop.admin, {
      boxId: shop.boxes[0]!.id,
      startsAt: at('2026-10-30 12:30'),
      endsAt: at('2026-10-30 13:00'),
      note: 'ta’mir',
    });
    await t.services.schedule.createBlock(shop.admin, {
      boxId: shop.boxes[1]!.id,
      startsAt: at('2026-10-30 09:00'),
      endsAt: at('2026-10-30 20:00'),
      note: 'ta’mir',
    });

    await expect(
      admin().updateItems(shop.admin, order.id, [
        { serviceId: shop.zones.bonnet },
        { serviceId: shop.zones.bumper },
      ]),
    ).rejects.toMatchObject({ code: 'slot_taken' });
    const kept = await admin().get(shop.admin, order.id);
    expect(kept).toMatchObject({ subtotal: 1_400_000, endsAt: { time: '12:15' } });
    expect(kept.items).toHaveLength(1);
    expect((await activeBookings()).filter((row) => row.orderId === order.id)).toHaveLength(1);
  });

  it('not once the work has started', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await database.db.update(orders).set({ status: 'in_work', holdUntil: null });
    await expect(
      admin().updateItems(shop.admin, order.id, [{ serviceId: shop.zones.bumper }]),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });
});

describe('cancelling by the staff (PLAN 8, 9.1)', () => {
  it('cancels with a reason, gives the box back and tells the client', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await admin().call(shop.admin, order.id, { outcome: 'confirmed' });
    const done = await admin().cancel(shop.admin, order.id, {
      reasonId: await reasonId('duplicate'),
    });
    expect(done).toMatchObject({ status: 'cancelled', cancelReason: { uz: 'Ariza takrorlangan' } });
    expect(await activeBookings()).toHaveLength(0);
    expect(await ofType('order.cancelled')).toHaveLength(1);
  });

  it('a reason that is the system’s, or none, is refused', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await expect(
      admin().cancel(shop.admin, order.id, { reasonId: await reasonId('no_contact') }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(admin().cancel(shop.admin, order.id, { reasonId: newId() })).rejects.toMatchObject(
      {
        code: 'validation',
      },
    );
  });

  it('work in progress is the owner’s to cancel, not the admin’s', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await database.db.update(orders).set({ status: 'in_work', holdUntil: null });
    const input = { reasonId: await reasonId('cannot_perform') };
    await expect(admin().cancel(shop.admin, order.id, input)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await admin().cancel(shop.owner, order.id, input)).toMatchObject({
      status: 'cancelled',
    });
    expect(await activeBookings()).toHaveLength(0);
  });

  it('a finished order is not cancelled', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    for (const status of ['completed', 'cancelled', 'no_show', 'ready_for_pickup'] as const) {
      await database.db.update(orders).set({ status, holdUntil: null });
      await expect(
        admin().cancel(shop.owner, order.id, { reasonId: await reasonId('duplicate') }),
      ).rejects.toMatchObject({ code: 'invalid_transition' });
    }
  });
});

describe('an order entered by hand (PLAN 9.1, design A7)', () => {
  const manual = (clientId: string, carId: string, overrides: object = {}) => ({
    clientId,
    carId,
    serviceIds: [shop.zones.bonnet],
    startsAt: FRIDAY_10,
    source: 'phone' as const,
    confirmedByClient: true,
    ...overrides,
  });

  it('"the client confirmed by phone": it is confirmed at once, with no hold', async () => {
    const { client, car } = await clientWithCar();
    const order = await admin().create(
      shop.admin,
      manual(client.userId, car.id, { comment: 'Qo‘ng‘iroq' }),
    );
    expect(order).toMatchObject({
      status: 'confirmed',
      source: 'phone',
      holdUntil: null,
      comment: 'Qo‘ng‘iroq',
      client: { fullName: 'Aziz Karimov', hasTelegram: true },
      total: 1_400_000,
      boxName: '1-boks',
    });
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ createdBy: shop.admin.userId, confirmedBy: shop.admin.userId });
    const history = await database.db.select().from(statusHistory);
    expect(history).toMatchObject([
      { fromStatus: null, toStatus: 'confirmed', actorId: shop.admin.userId },
    ]);
    expect(await ofType('order.confirmed')).toHaveLength(1);
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'order.create')),
    ).toHaveLength(1);
  });

  it('not confirmed by the client: a new order that holds its slot', async () => {
    const { client, car } = await clientWithCar();
    const order = await admin().create(
      shop.admin,
      manual(client.userId, car.id, { confirmedByClient: false, source: 'instagram' }),
    );
    expect(order).toMatchObject({ status: 'new', source: 'instagram' });
    expect(order.holdUntil).toMatchObject({ date: '2026-10-29', time: '12:00' });
    expect(await ofType('order.created')).toHaveLength(1);
  });

  it('a client without Telegram is not written to, and nothing fails', async () => {
    const { client, car } = await clientWithCar({ telegram: false });
    await expect(admin().create(shop.admin, manual(client.userId, car.id))).resolves.toMatchObject({
      status: 'confirmed',
      client: { hasTelegram: false },
    });
    expect(await messages()).toHaveLength(0);
  });

  it('a client at the door: the staff book a time sooner than the lead time', async () => {
    const { client, car } = await clientWithCar();
    const order = await admin().create(
      shop.admin,
      manual(client.userId, car.id, { startsAt: at('2026-10-29 10:30'), source: 'walk_in' }),
    );
    expect(order.startsAt).toMatchObject({ date: '2026-10-29', time: '10:30' });
  });

  it('the same rules as a client: a time held is slot_taken, an odd time is not offered', async () => {
    const { client, car } = await clientWithCar();
    for (let i = 0; i < 2; i += 1) {
      const other = await clientWithCar();
      await place(other.client, other.car.id);
    }
    await expect(admin().create(shop.admin, manual(client.userId, car.id))).rejects.toMatchObject({
      code: 'slot_taken',
    });
    await expect(
      admin().create(
        shop.admin,
        manual(client.userId, car.id, { startsAt: at('2026-10-30 10:10') }),
      ),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
  });

  it('only for a client and their own car', async () => {
    const { client, car } = await clientWithCar();
    const other = await clientWithCar();
    await expect(
      admin().create(shop.admin, manual(client.userId, other.car.id)),
    ).rejects.toMatchObject({ code: 'not_found' });
    // A staff member is not a client.
    await expect(
      admin().create(shop.admin, manual(shop.owner.userId, car.id)),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(admin().create(shop.admin, manual(newId(), car.id))).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('the list and "Today" (design A1, A6)', () => {
  it('lists what is in progress; finished orders only for the days asked', async () => {
    const { client, car } = await clientWithCar();
    const active = await place(client, car.id);
    const done = await place(client, car.id, { startsAt: at('2026-10-30 15:00') });
    await database.db
      .update(orders)
      .set({ status: 'completed', holdUntil: null })
      .where(eq(orders.id, done.id));

    expect((await admin().list(shop.admin, {})).map((order) => order.id)).toEqual([active.id]);
    expect(await admin().list(shop.admin, { from: '2026-10-30', to: '2026-10-30' })).toHaveLength(
      2,
    );
    expect(await admin().list(shop.admin, { from: '2026-10-31', to: '2026-10-31' })).toHaveLength(
      1,
    );
  });

  it('is searched by number, name, phone and plate, and by kind of work', async () => {
    const aziz = await clientWithCar({ name: 'Aziz Karimov' });
    const dilnoza = await clientWithCar({ name: 'Dilnoza Aliyeva' });
    const a = await place(aziz.client, aziz.car.id);
    const d = await place(dilnoza.client, dilnoza.car.id, { startsAt: at('2026-10-30 15:00') });
    const find = async (q: string) =>
      (await admin().list(shop.admin, { q })).map((order) => order.id);

    expect(await find(String(d.number))).toEqual([d.id]);
    expect(await find('dilno')).toEqual([d.id]);
    expect(await find('AZIZ')).toEqual([a.id]);
    expect(await find(aziz.car.plate.slice(0, 5).toLowerCase())).toEqual([a.id]);
    expect(await find(aziz.client.phone!.slice(-6))).toEqual([a.id]);
    expect(await find('yo‘q odam')).toEqual([]);
    // "%" typed by a person is not a wildcard.
    expect(await find('%')).toEqual([]);

    expect(await admin().list(shop.admin, { serviceTypeId: shop.ceramicId })).toHaveLength(2);
    expect(await admin().list(shop.admin, { serviceTypeId: newId() })).toHaveLength(0);
  });

  it('shows who is waiting for a call: working minutes, and a warning after the limit', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    advance('2026-10-29 10:14');
    expect(await admin().get(shop.admin, order.id)).toMatchObject({
      waitingMin: 14,
      callWarn: false,
    });
    advance('2026-10-29 10:15');
    expect(await admin().get(shop.admin, order.id)).toMatchObject({
      waitingMin: 15,
      callWarn: true,
    });
    const today = await admin().today(shop.admin);
    expect(today.counters).toMatchObject({ newOrders: 1, unanswered: 1 });
  });

  it('"Today": counters and the visits of the day, without the cancelled ones', async () => {
    const a = await clientWithCar();
    const b = await clientWithCar();
    const c = await clientWithCar();
    await place(a.client, a.car.id, { startsAt: at('2026-10-29 12:30') });
    const second = await place(b.client, b.car.id, { startsAt: at('2026-10-29 15:00') });
    await place(c.client, c.car.id); // tomorrow

    await admin().call(shop.admin, second.id, {
      outcome: 'rejected',
      reasonId: await reasonId('duplicate'),
    });
    await database.db
      .update(orders)
      .set({ status: 'in_work', holdUntil: null })
      .where(eq(orders.clientId, a.client.userId));

    const today = await admin().today(shop.admin);
    expect(today.counters).toEqual({
      newOrders: 1,
      unanswered: 0,
      arrivalsToday: 1,
      inWork: 1,
      readyForPickup: 0,
    });
    expect(today.arrivals).toHaveLength(1);
    expect(today.arrivals[0]?.startsAt.time).toBe('12:30');
  });

  it('an order moved to another day counts on the day it is now booked for, not the old one', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id); // Friday 10:00
    await admin().call(shop.admin, order.id, { outcome: 'confirmed' });
    await admin().reschedule(shop.admin, order.id, at('2026-10-29 15:00')); // today, earlier than before

    const today = await admin().today(shop.admin);
    expect(today.arrivals.map((arrival) => arrival.id)).toEqual([order.id]);
    expect(today.counters.arrivalsToday).toBe(1);

    // Finished orders are listed for the days asked: the day it was moved to, not the one it left.
    await database.db
      .update(orders)
      .set({ status: 'completed', holdUntil: null })
      .where(eq(orders.id, order.id));
    expect(await admin().list(shop.admin, { from: '2026-10-29', to: '2026-10-29' })).toHaveLength(
      1,
    );
    expect(await admin().list(shop.admin, { from: '2026-10-30', to: '2026-10-30' })).toHaveLength(
      0,
    );
  });

  it('what the staff may do comes with the order', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    expect((await admin().get(shop.admin, order.id)).actions).toEqual({
      canCall: true,
      canEditItems: true,
      canReschedule: true,
      canCancel: true,
      canNoShow: false,
      canDiscount: true,
      canPriceItems: false,
      canCheckout: false,
    });
  });

  it('cancel reasons for the staff: the clients’ and the staff’s own, not the system’s', async () => {
    const reasons = await admin().cancelReasons(shop.admin);
    const names = reasons.map((reason) => reason.nameUz);
    expect(names).toContain('Qimmat');
    expect(names).toContain('Servis bajara olmaydi');
    expect(names).not.toContain('Aloqa bo‘lmadi');
  });
});

describe('what the system does on its own (PLAN 4.8)', () => {
  const task = (name: string) => t.services.tasks.find((candidate) => candidate.name === name)!;

  describe('call-sla', () => {
    async function bosses() {
      const boss = await insertStaff(database.db, ['director']);
      return { boss, owners: [boss.id, shop.owner.userId] };
    }

    it('tells the director and the owner once, when a request waits too long for a call', async () => {
      const { client, car } = await clientWithCar();
      const order = await place(client, car.id);
      const { owners } = await bosses();

      advance('2026-10-29 10:29');
      await task('call-sla').run(t.clock.now());
      expect(await ofType('staff.order_unanswered')).toHaveLength(0);

      advance('2026-10-29 10:30');
      await task('call-sla').run(t.clock.now());
      await task('call-sla').run(t.clock.now());
      const told = await ofType('staff.order_unanswered');
      expect(told.map((row) => row.recipientId).sort()).toEqual([...owners].sort());
      expect(told[0]?.payload).toMatchObject({
        notification: { number: order.number, waitingMin: 30, clientName: 'Aziz Karimov' },
      });
    });

    it('not once somebody has called, whatever the outcome', async () => {
      const { client, car } = await clientWithCar();
      const order = await place(client, car.id);
      await bosses();
      await admin().call(shop.admin, order.id, { outcome: 'no_answer' });
      advance('2026-10-29 12:00');
      await task('call-sla').run(t.clock.now());
      expect(await ofType('staff.order_unanswered')).toHaveLength(0);
    });

    it('counts only working time: a request made at night is not late in the morning', async () => {
      const { client, car } = await clientWithCar();
      advance('2026-10-29 23:00');
      await place(client, car.id, { startsAt: at('2026-11-03 10:00') });
      await bosses();

      advance('2026-10-30 09:20');
      await task('call-sla').run(t.clock.now());
      expect(await ofType('staff.order_unanswered')).toHaveLength(0);
      advance('2026-10-30 09:30');
      await task('call-sla').run(t.clock.now());
      expect(await ofType('staff.order_unanswered')).toHaveLength(2);
    });
  });

  describe('reminders', () => {
    const reminders = async () =>
      (await ofType('order.reminder')).map(
        (row) =>
          (row.payload as { notification: { hoursBefore: number } }).notification.hoursBefore,
      );

    async function confirmedFor(startsAt: Date, options: { telegram?: boolean } = {}) {
      const { client, car } = await clientWithCar(options);
      const order = await place(client, car.id, { startsAt });
      await admin().call(shop.admin, order.id, { outcome: 'confirmed' });
      return { client, order };
    }

    it('a day before and two hours before, each once', async () => {
      await confirmedFor(FRIDAY_10);
      advance('2026-10-29 10:00'); // the 24-hour window opens, and the order was confirmed just then
      await task('reminders').run(t.clock.now());
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([24]);

      advance('2026-10-30 07:59');
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([24]);
      advance('2026-10-30 08:00');
      await task('reminders').run(t.clock.now());
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([24, 2]);
    });

    it('confirmed inside the 24-hour window: that reminder is skipped, the 2-hour one still goes', async () => {
      const { client, car } = await clientWithCar();
      const order = await place(client, car.id);
      advance('2026-10-29 18:00');
      await admin().call(shop.admin, order.id, { outcome: 'confirmed' });
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([]);
      advance('2026-10-30 08:00');
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([2]);
    });

    it('not to a client who switched them off, who has no Telegram, or whose order is cancelled', async () => {
      const off = await confirmedFor(at('2026-10-30 11:00'));
      await database.db
        .update(users)
        .set({ remindersEnabled: false })
        .where(eq(users.id, off.client.userId));
      await confirmedFor(at('2026-10-30 14:00'), { telegram: false });
      const gone = await confirmedFor(at('2026-10-30 16:00'));
      await admin().cancel(shop.admin, gone.order.id, { reasonId: await reasonId('duplicate') });

      advance('2026-10-30 08:00');
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([]);
    });

    it('a moved order is reminded again for its new time', async () => {
      const { order } = await confirmedFor(FRIDAY_10);
      advance('2026-10-29 10:00');
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([24]);

      await admin().reschedule(shop.admin, order.id, at('2026-10-31 11:00'));
      advance('2026-10-30 11:00');
      await task('reminders').run(t.clock.now());
      expect(await reminders()).toEqual([24, 24]);
    });
  });
});

describe('the order is one thing in the database', () => {
  it('a call, its row and the status change are written together', async () => {
    const { client, car } = await clientWithCar();
    const order = await place(client, car.id);
    await admin().call(shop.admin, order.id, { outcome: 'confirmed' });
    expect(await database.db.select().from(orderCalls)).toHaveLength(1);
    const history = await database.db
      .select()
      .from(statusHistory)
      .where(eq(statusHistory.entityId, order.id))
      .orderBy(asc(statusHistory.at), asc(statusHistory.id));
    expect(history.map((step) => step.toStatus)).toEqual(['new', 'confirmed']);
  });
});
