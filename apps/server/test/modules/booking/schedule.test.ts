import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, bookings } from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const schedule = () => t.services.schedule;

const block = (boxIndex: number, from: string, to: string, note = 'ta’mir') => ({
  boxId: shop.boxes[boxIndex]!.id,
  startsAt: at(from),
  endsAt: at(to),
  note,
});

async function orderAt(startsAt: Date) {
  const client = await makeClient(database.db);
  const car = await t.services.garage.create(client, {
    modelId: shop.models.tracker,
    customModelText: null,
    bodyClass: null,
    year: 2022,
    plate: `01${Math.floor(Math.random() * 900 + 100)}ABC`,
    color: null,
  });
  return t.services.orders.create(client, {
    requestId: newId(),
    carId: car.id,
    serviceIds: [shop.zones.bonnet],
    startsAt,
  });
}

describe('blocking a box (PLAN 10.4, design A4)', () => {
  it('holds the box for the time and is audited', async () => {
    const { id } = await schedule().createBlock(
      shop.admin,
      block(0, '2026-10-30 14:00', '2026-10-30 16:00', 'Ko‘targich ta’miri'),
    );
    const [row] = await database.db.select().from(bookings).where(eq(bookings.id, id));
    expect(row).toMatchObject({
      kind: 'block',
      orderId: null,
      note: 'Ko‘targich ta’miri',
      createdBy: shop.admin.userId,
    });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'block.create')),
    ).toHaveLength(1);
  });

  it('a block over a held time is slot_taken: over an order, over a block, partly over either', async () => {
    await orderAt(at('2026-10-30 10:00')); // box 1, until 12:15
    await schedule().createBlock(shop.admin, block(1, '2026-10-30 14:00', '2026-10-30 16:00'));

    await expect(
      schedule().createBlock(shop.admin, block(0, '2026-10-30 11:00', '2026-10-30 13:00')),
    ).rejects.toMatchObject({ code: 'slot_taken' });
    await expect(
      schedule().createBlock(shop.admin, block(0, '2026-10-30 09:00', '2026-10-30 20:00')),
    ).rejects.toMatchObject({ code: 'slot_taken' });
    await expect(
      schedule().createBlock(shop.admin, block(1, '2026-10-30 15:00', '2026-10-30 17:00')),
    ).rejects.toMatchObject({ code: 'slot_taken' });
    // Touching is not overlapping.
    await expect(
      schedule().createBlock(shop.admin, block(0, '2026-10-30 12:15', '2026-10-30 13:00')),
    ).resolves.toBeDefined();
    expect(await database.db.select().from(bookings)).toHaveLength(3);
  });

  it('a block takes the time away from the clients: it is not free any more', async () => {
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 A 777 BA',
      color: null,
    });
    const input = { carId: car.id, serviceIds: [shop.zones.bonnet], date: '2026-10-30' };
    const free = (await t.services.orders.slots(client, input)).slots.find(
      (slot) => slot.startsAt.time === '10:00',
    );
    expect(free?.free).toBe(true);

    await schedule().createBlock(shop.admin, block(0, '2026-10-30 09:00', '2026-10-30 20:00'));
    await schedule().createBlock(shop.admin, block(1, '2026-10-30 10:00', '2026-10-30 12:00'));
    const taken = (await t.services.orders.slots(client, input)).slots.find(
      (slot) => slot.startsAt.time === '10:00',
    );
    expect(taken?.free).toBe(false);
  });

  it('refuses an end that is not after the start, and a box that does not exist', async () => {
    await expect(
      schedule().createBlock(shop.admin, block(0, '2026-10-30 12:00', '2026-10-30 12:00')),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.endsAt'] },
    });
    await expect(
      schedule().createBlock(shop.admin, {
        ...block(0, '2026-10-30 12:00', '2026-10-30 13:00'),
        boxId: newId(),
      }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.boxId'] } });
  });

  it('is removed, and the time is free again; an order’s booking is not a block', async () => {
    const { id } = await schedule().createBlock(
      shop.admin,
      block(0, '2026-10-30 14:00', '2026-10-30 16:00'),
    );
    await schedule().removeBlock(shop.admin, id);
    await expect(
      schedule().createBlock(shop.admin, block(0, '2026-10-30 14:00', '2026-10-30 16:00')),
    ).resolves.toBeDefined();
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'block.remove')),
    ).toHaveLength(1);

    await expect(schedule().removeBlock(shop.admin, id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await orderAt(at('2026-10-30 10:00'));
    const [order] = await database.db.select().from(bookings).where(eq(bookings.kind, 'order'));
    await expect(schedule().removeBlock(shop.admin, order!.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('only the staff who write the schedule: the director reads', async () => {
    const boss = staffActorOf(await insertStaff(database.db, ['director']), ['director']);
    await expect(
      schedule().createBlock(boss, block(0, '2026-10-30 14:00', '2026-10-30 16:00')),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(schedule().removeBlock(boss, newId())).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(schedule().day(boss, '2026-10-30')).resolves.toBeDefined();
    const master = staffActorOf(await insertStaff(database.db, ['master']), ['master']);
    await expect(schedule().day(master, '2026-10-30')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('the day’s table (design A4)', () => {
  it('lists each box with its orders and blocks, and the working hours', async () => {
    const order = await orderAt(at('2026-10-30 10:00'));
    await schedule().createBlock(
      shop.admin,
      block(1, '2026-10-30 14:00', '2026-10-30 16:00', 'Ko‘targich'),
    );

    const day = await schedule().day(shop.admin, '2026-10-30');
    expect(day).toMatchObject({
      date: '2026-10-30',
      closedReason: null,
      hours: { open: '09:00', close: '20:00', breakStart: '13:00', breakEnd: '14:00' },
    });
    expect(day.boxes.map((box) => box.name)).toEqual(['1-boks', '2-boks']);
    expect(day.boxes[0]?.items).toMatchObject([
      {
        kind: 'order',
        startsAt: { time: '10:00' },
        endsAt: { time: '12:15' },
        order: { id: order.id, number: order.number, status: 'new', clientName: 'Aziz Karimov' },
      },
    ]);
    expect(day.boxes[1]?.items).toMatchObject([{ kind: 'block', note: 'Ko‘targich', order: null }]);
  });

  it('a job that runs over several days shows on each of them; a given-back booking does not show', async () => {
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 B 123 CD',
      color: null,
    });
    const long = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.full],
      startsAt: at('2026-10-30 09:00'),
    });
    for (const date of ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']) {
      const day = await schedule().day(shop.admin, date);
      expect(day.boxes[0]?.items.map((item) => item.order?.id)).toEqual([long.id]);
    }
    expect((await schedule().day(shop.admin, '2026-11-03')).boxes[0]?.items).toEqual([]);

    const gone = await schedule().createBlock(
      shop.admin,
      block(1, '2026-10-30 14:00', '2026-10-30 16:00'),
    );
    await schedule().removeBlock(shop.admin, gone.id);
    expect((await schedule().day(shop.admin, '2026-10-30')).boxes[1]?.items).toEqual([]);
  });

  it('a day off and a holiday say why they are closed', async () => {
    await t.services.workshop.hours.addHoliday(shop.owner, { date: '2026-11-03', name: 'Bayram' });
    expect(await schedule().day(shop.admin, '2026-11-01')).toMatchObject({
      hours: null,
      closedReason: 'day_off',
    });
    expect(await schedule().day(shop.admin, '2026-11-03')).toMatchObject({
      hours: null,
      closedReason: 'holiday',
    });
  });

  it('without a date it is today, and the server’s clock comes with it', async () => {
    const day = await schedule().day(shop.admin);
    expect(day).toMatchObject({ date: '2026-10-29', now: { date: '2026-10-29', time: '10:00' } });
    expect((await t.services.adminOrders.today(shop.admin)).now).toMatchObject({ time: '10:00' });
  });

  it('only boxes in service are shown', async () => {
    await t.services.workshop.boxes.update(shop.owner, shop.boxes[1]!.id, { isActive: false });
    expect((await schedule().day(shop.admin, '2026-10-30')).boxes.map((box) => box.name)).toEqual([
      '1-boks',
    ]);
  });
});
