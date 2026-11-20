import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, cars, orderItems, orders, outbox, users } from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import type { TmaActor } from '../../../src/platform/actors';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf, typedInCyrillic, uniquePhone } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const clients = () => t.services.clients;
const carInput = (overrides: object = {}) => ({
  modelId: shop.models.tracker,
  customModelText: null,
  bodyClass: null,
  year: 2022,
  plate: '01 A 777 BA',
  color: null,
  ...overrides,
});

async function clientWithOrder(
  options: { telegram?: boolean; name?: string; status?: 'completed' | 'new'; at?: string } = {},
) {
  const client = await makeClient(database.db, options);
  const car = await t.services.garage.create(
    client,
    carInput({ plate: `01${Math.floor(Math.random() * 900 + 100)}ABC` }),
  );
  const order = await t.services.orders.create(client, {
    requestId: newId(),
    carId: car.id,
    serviceIds: [shop.zones.bonnet],
    startsAt: at(options.at ?? '2026-10-30 10:00'),
  });
  if (options.status === 'completed') {
    await database.db
      .update(orders)
      .set({ status: 'completed', holdUntil: null })
      .where(eq(orders.id, order.id));
  }
  return { client, car, order };
}

const director = async () =>
  staffActorOf(await insertStaff(database.db, ['director']), ['director']);

describe('who may do what with clients (PLAN 8)', () => {
  it('the director reads; the admin writes; only the owner erases', async () => {
    const boss = await director();
    expect(await clients().list(boss, { filter: 'all', limit: 50 })).toMatchObject({ items: [] });
    await expect(
      clients().create(boss, { fullName: 'X', phone: uniquePhone() }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const created = await clients().create(shop.admin, { fullName: 'Aziz', phone: uniquePhone() });
    await expect(clients().update(boss, created.id, { fullName: 'Y' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(clients().addCar(boss, created.id, carInput())).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(clients().anonymize(shop.admin, created.id)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(clients().anonymize(boss, created.id)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(await clients().get(boss, created.id)).toMatchObject({ fullName: 'Aziz' });
  });

  it('a master sees no clients', async () => {
    const master = staffActorOf(await insertStaff(database.db, ['master']), ['master']);
    await expect(clients().list(master, { filter: 'all', limit: 50 })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('a client entered by hand (design A10)', () => {
  it('is made with a phone that is kept in one form, not verified, without Telegram, and audited', async () => {
    const card = await clients().create(shop.admin, {
      fullName: 'Dilnoza Aliyeva',
      phone: '90 123 45 67',
    });
    expect(card).toMatchObject({
      fullName: 'Dilnoza Aliyeva',
      phone: '+998901234567',
      phoneVerified: false,
      hasTelegram: false,
      carsCount: 0,
      ordersCount: 0,
      cars: [],
      orders: [],
      internalNote: null,
    });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'client.create')),
    ).toHaveLength(1);
  });

  it('a number that is not one, or that is taken, is refused', async () => {
    await expect(
      clients().create(shop.admin, { fullName: 'X', phone: 'call me' }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.phone'] },
    });
    const first = await clients().create(shop.admin, { fullName: 'A', phone: '+998901234567' });
    await expect(
      clients().create(shop.admin, { fullName: 'B', phone: '90 123 45 67' }),
    ).rejects.toMatchObject({
      code: 'phone_taken',
    });
    expect(first.phone).toBe('+998901234567');
  });

  it('gets a car from the admin, who needs no phone check; the plate is in one form and unique', async () => {
    const card = await clients().create(shop.admin, { fullName: 'A', phone: uniquePhone() });
    const added = await clients().addCar(shop.admin, card.id, carInput());
    expect(added).toMatchObject({ plate: '01A777BA', bodyClass: 'M', brand: 'Chevrolet' });
    await expect(clients().addCar(shop.admin, card.id, carInput())).rejects.toMatchObject({
      code: 'plate_taken',
    });
    expect((await clients().get(shop.admin, card.id)).cars).toHaveLength(1);
  });

  it('and then takes an order made by hand', async () => {
    const card = await clients().create(shop.admin, { fullName: 'A', phone: uniquePhone() });
    const car = await clients().addCar(shop.admin, card.id, carInput());
    const order = await t.services.adminOrders.create(shop.admin, {
      clientId: card.id,
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 10:00'),
      source: 'phone',
      confirmedByClient: true,
    });
    expect(order.client).toMatchObject({ id: card.id, hasTelegram: false });
    expect(await database.db.select().from(outbox)).toHaveLength(0);
    expect((await clients().get(shop.admin, card.id)).orders).toHaveLength(1);
  });
});

describe('changing a client (design A10)', () => {
  it('the name, the note and a number nobody verified; the log says the note changed, not what it says', async () => {
    const card = await clients().create(shop.admin, { fullName: 'A', phone: '+998901111111' });
    const updated = await clients().update(shop.admin, card.id, {
      fullName: 'Aziz Karimov',
      phone: '+998902222222',
      internalNote: '  Qo‘ng‘iroqni kechqurun qiling  ',
    });
    expect(updated).toMatchObject({
      fullName: 'Aziz Karimov',
      phone: '+998902222222',
      internalNote: 'Qo‘ng‘iroqni kechqurun qiling',
    });
    const [entry] = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'client.update'));
    expect(JSON.stringify(entry)).not.toContain('kechqurun');
    expect(entry?.after).toMatchObject({ hasNote: true });

    const cleared = await clients().update(shop.admin, card.id, { internalNote: null });
    expect(cleared.internalNote).toBeNull();
    // Nothing changed, nothing logged.
    await clients().update(shop.admin, card.id, { fullName: 'Aziz Karimov' });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'client.update')),
    ).toHaveLength(2);
  });

  it('a number Telegram verified is not changed in the panel', async () => {
    const { client } = await clientWithOrder();
    await expect(
      clients().update(shop.admin, client.userId, { phone: uniquePhone() }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.phone'] } });
    await expect(
      clients().update(shop.admin, client.userId, { fullName: 'Yangi ism' }),
    ).resolves.toMatchObject({
      fullName: 'Yangi ism',
      phoneVerified: true,
    });
  });

  it('a number that belongs to another is refused', async () => {
    const a = await clients().create(shop.admin, { fullName: 'A', phone: '+998901111111' });
    await clients().create(shop.admin, { fullName: 'B', phone: '+998902222222' });
    await expect(
      clients().update(shop.admin, a.id, { phone: '+998902222222' }),
    ).rejects.toMatchObject({
      code: 'phone_taken',
    });
  });

  it('a staff member, or somebody who does not exist, is not a client', async () => {
    const staff = await insertStaff(database.db, ['admin']);
    for (const id of [staff.id, shop.owner.userId, newId()]) {
      await expect(clients().get(shop.admin, id)).rejects.toMatchObject({ code: 'not_found' });
      await expect(clients().update(shop.admin, id, { fullName: 'X' })).rejects.toMatchObject({
        code: 'not_found',
      });
      await expect(clients().addCar(shop.admin, id, carInput())).rejects.toMatchObject({
        code: 'not_found',
      });
    }
    const list = await clients().list(shop.admin, { filter: 'all', limit: 50 });
    expect(list.items.map((item) => item.id)).not.toContain(staff.id);
  });
});

describe('the list and its filters (design A10, PLAN 18)', () => {
  const ids = async (query: object) =>
    (await clients().list(shop.admin, { filter: 'all', limit: 50, ...query })).items.map(
      (item) => item.id,
    );

  it('shows who has Telegram, how many cars and orders, and the last visit', async () => {
    const a = await clientWithOrder({ status: 'completed' });
    const { items } = await clients().list(shop.admin, { filter: 'all', limit: 50 });
    expect(items).toMatchObject([
      {
        id: a.client.userId,
        hasTelegram: true,
        carsCount: 1,
        ordersCount: 1,
        lastVisit: { date: '2026-10-30', time: '10:00' },
        deletionRequested: false,
        isAnonymized: false,
      },
    ]);
  });

  it('the last visit is when the visit was booked for in the end, even if it was moved earlier', async () => {
    const { client, order } = await clientWithOrder(); // booked for Friday 10:00
    await t.services.adminOrders.reschedule(shop.admin, order.id, at('2026-10-29 15:00'));
    await database.db
      .update(orders)
      .set({ status: 'completed', holdUntil: null })
      .where(eq(orders.id, order.id));
    const { items } = await clients().list(shop.admin, { filter: 'all', limit: 50 });
    expect(items.find((item) => item.id === client.userId)?.lastVisit).toMatchObject({
      date: '2026-10-29',
      time: '15:00',
    });
  });

  it('is searched by name, phone and plate', async () => {
    const aziz = await clientWithOrder({ name: 'Aziz Karimov' });
    const dilnoza = await clientWithOrder({ name: 'Dilnoza Aliyeva' });
    expect(await ids({ q: 'aziz' })).toEqual([aziz.client.userId]);
    expect(await ids({ q: 'ALIYEVA' })).toEqual([dilnoza.client.userId]);
    expect(await ids({ q: dilnoza.client.phone!.slice(-6) })).toEqual([dilnoza.client.userId]);
    expect(await ids({ q: aziz.car.plate.toLowerCase() })).toEqual([aziz.client.userId]);
    // As a Russian keyboard types it, and with dashes: "01-123-АВС" (Cyrillic letters).
    expect(await ids({ q: typedInCyrillic(aziz.car.plate) })).toEqual([aziz.client.userId]);
    expect(await ids({ q: '%' })).toEqual([]);
  });

  it('"without Telegram" lists those the admin entered by phone', async () => {
    const withTelegram = await clientWithOrder();
    const byHand = await clients().create(shop.admin, { fullName: 'Qo‘lda', phone: uniquePhone() });
    expect(await ids({ filter: 'no_telegram' })).toEqual([byHand.id]);
    expect(await ids({})).toHaveLength(2);
    expect(await ids({ filter: 'no_telegram' })).not.toContain(withTelegram.client.userId);
  });

  it('"regular" are those with two finished visits', async () => {
    const regular = await clientWithOrder({ status: 'completed' });
    const car = regular.car;
    const second = await t.services.orders.create(regular.client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 15:00'),
    });
    await database.db
      .update(orders)
      .set({ status: 'completed', holdUntil: null })
      .where(eq(orders.id, second.id));
    await clientWithOrder({ status: 'completed', at: '2026-11-02 10:00' });
    await clientWithOrder({ at: '2026-11-02 15:00' });
    expect(await ids({ filter: 'regular' })).toEqual([regular.client.userId]);
  });

  it('"lapsed" have not been for 90 days, and nothing is in progress for them', async () => {
    const old = await clientWithOrder({ status: 'completed' });
    const busy = await clientWithOrder({ status: 'completed', at: '2026-11-02 10:00' });
    const never = await clientWithOrder({ at: '2026-11-02 15:00' }); // never came: not lapsed, just not a visitor yet
    await t.services.orders.create(busy.client, {
      requestId: newId(),
      carId: busy.car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 15:00'),
    });

    t.clock.set(at('2026-12-01 10:00')); // 32 days after: nobody is lapsed yet
    expect(await ids({ filter: 'lapsed' })).toEqual([]);
    t.clock.set(at('2027-02-01 10:00')); // 94 days after the visit
    expect(await ids({ filter: 'lapsed' })).toEqual([old.client.userId]);
    expect(await ids({ filter: 'lapsed' })).not.toContain(never.client.userId);
  });

  it('comes in pages, newest first', async () => {
    const made = [];
    for (let i = 0; i < 5; i += 1)
      made.push(
        (await clients().create(shop.admin, { fullName: `K${i}`, phone: uniquePhone() })).id,
      );
    const first = await clients().list(shop.admin, { filter: 'all', limit: 2 });
    expect(first.items.map((item) => item.fullName)).toEqual(['K4', 'K3']);
    expect(first.nextCursor).not.toBeNull();
    const second = await clients().list(shop.admin, {
      filter: 'all',
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.fullName)).toEqual(['K2', 'K1']);
    const last = await clients().list(shop.admin, {
      filter: 'all',
      limit: 2,
      cursor: second.nextCursor!,
    });
    expect(last).toMatchObject({ items: [{ fullName: 'K0' }], nextCursor: null });
  });
});

describe('erasing personal data (TZ 15.3, PLAN 15)', () => {
  it('erases name, phone, Telegram link, note and the plates, and keeps the orders and what they say', async () => {
    const { client, car, order } = await clientWithOrder({
      name: 'Aziz Karimov',
      status: 'completed',
    });
    await clients().update(shop.admin, client.userId, { internalNote: 'Qiyin mijoz' });
    expect((await clients().get(shop.admin, client.userId)).telegramId).toBe(client.telegramId);

    const card = await clients().anonymize(shop.owner, client.userId);
    expect(card).toMatchObject({
      fullName: 'Anonim',
      phone: null,
      hasTelegram: false,
      telegramId: null,
      isAnonymized: true,
      internalNote: null,
      cars: [],
    });

    const [user] = await database.db.select().from(users).where(eq(users.id, client.userId));
    expect(user).toMatchObject({
      fullName: 'Anonim',
      phone: null,
      telegramId: null,
      internalNote: null,
      phoneVerified: false,
    });
    expect(user?.anonymizedAt).toEqual(t.clock.now());
    const [row] = await database.db.select().from(cars).where(eq(cars.id, car.id));
    expect(row?.plate).toMatch(/^ANON-/);

    // The order, its items and its total are all still there; the plate is not.
    const [kept] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(kept).toMatchObject({ status: 'completed', total: 1_400_000, clientId: client.userId });
    expect((kept?.carSnapshot as { plate: string }).plate).toBe('—');
    expect(
      await database.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
    ).toHaveLength(1);
    expect(card.orders).toMatchObject([{ id: order.id, total: 1_400_000, car: { plate: '—' } }]);

    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'client.anonymize')),
    ).toHaveLength(1);
    // Nobody finds them by what was erased any more, and the number can belong to somebody else.
    expect(
      (await clients().list(shop.admin, { filter: 'all', limit: 50, q: 'Karimov' })).items,
    ).toEqual([]);
    await expect(
      clients().create(shop.admin, { fullName: 'Yangi', phone: client.phone! }),
    ).resolves.toBeDefined();
  });

  it('twice is not found; and the client can no longer be edited', async () => {
    const { client } = await clientWithOrder();
    await clients().anonymize(shop.owner, client.userId);
    await expect(clients().anonymize(shop.owner, client.userId)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      clients().update(shop.admin, client.userId, { fullName: 'X' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('an erased client cannot be given an order', async () => {
    const { client, car } = await clientWithOrder();
    await clients().anonymize(shop.owner, client.userId);
    await expect(
      t.services.adminOrders.create(shop.admin, {
        clientId: client.userId,
        carId: car.id,
        serviceIds: [shop.zones.bonnet],
        startsAt: at('2026-10-31 10:00'),
        source: 'phone',
        confirmedByClient: true,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('the client asks for their data to be erased (TZ 15.3)', () => {
  const tmaOf = (user: { id: string; telegramId: number | null }): TmaActor => ({
    kind: 'tma',
    userId: user.id,
    telegramId: user.telegramId ?? 0,
    roles: [],
  });

  it('the owner is told once, and the card shows the request', async () => {
    const { client } = await clientWithOrder();
    const actor = tmaOf({ id: client.userId, telegramId: client.telegramId });
    await t.services.identity.clients.requestDeletion(actor);
    await t.services.identity.clients.requestDeletion(actor);

    const told = (await database.db.select().from(outbox)).filter(
      (row) =>
        (row.payload as { notification: { type: string } }).notification.type ===
        'staff.deletion_requested',
    );
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: shop.owner.userId });
    expect(told[0]?.payload).toMatchObject({
      notification: { clientId: client.userId, clientName: 'Aziz Karimov' },
    });
    expect(await clients().get(shop.admin, client.userId)).toMatchObject({
      deletionRequested: true,
    });
  });

  it('an erased person cannot ask again', async () => {
    const { client } = await clientWithOrder();
    await clients().anonymize(shop.owner, client.userId);
    await expect(
      t.services.identity.clients.requestDeletion(
        tmaOf({ id: client.userId, telegramId: client.telegramId }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('cars added with "Other" wait for a real model (PLAN 7.6)', () => {
  const other = (plate: string) => ({
    modelId: null,
    customModelText: 'Zotye T600',
    bodyClass: 'L' as const,
    year: 2019,
    plate,
    color: null,
  });

  it('lists them with their owner, and not the cars that have a model or are gone', async () => {
    const client = await makeClient(database.db);
    const odd = await t.services.garage.create(client, other('01 C 111 CC'));
    await t.services.garage.create(client, carInput({ plate: '01 D 222 DD' }));
    const gone = await t.services.garage.create(client, other('01 E 333 EE'));
    await t.services.garage.archive(client, gone.id);

    expect(await t.services.garage.unmapped(shop.admin)).toMatchObject([
      {
        id: odd.id,
        clientId: client.userId,
        clientName: 'Aziz Karimov',
        customModelText: 'Zotye T600',
        bodyClass: 'L',
        plate: '01C111CC',
      },
    ]);
  });

  it('tying one to a model takes the model’s class unless the admin corrects it, and is audited', async () => {
    const client = await makeClient(database.db);
    const first = await t.services.garage.create(client, other('01 C 111 CC'));
    const second = await t.services.garage.create(client, other('01 F 444 FF'));

    const mapped = await t.services.garage.map(shop.admin, first.id, {
      modelId: shop.models.tracker,
    });
    expect(mapped).toMatchObject({
      id: first.id,
      modelId: shop.models.tracker,
      brand: 'Chevrolet',
      customModelText: null,
      bodyClass: 'M',
    });
    const corrected = await t.services.garage.map(shop.admin, second.id, {
      modelId: shop.models.tracker,
      bodyClass: 'XL',
    });
    expect(corrected.bodyClass).toBe('XL');
    expect(await t.services.garage.unmapped(shop.admin)).toEqual([]);
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'car.map')),
    ).toHaveLength(2);
  });

  it('a car that already has a model, someone else’s id, or a model that does not exist, is refused', async () => {
    const client = await makeClient(database.db);
    const odd = await t.services.garage.create(client, other('01 C 111 CC'));
    const fine = await t.services.garage.create(client, carInput({ plate: '01 D 222 DD' }));

    await expect(
      t.services.garage.map(shop.admin, fine.id, { modelId: shop.models.tracker }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      t.services.garage.map(shop.admin, newId(), { modelId: shop.models.tracker }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      t.services.garage.map(shop.admin, odd.id, { modelId: newId() }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.modelId'] } });
    expect(await t.services.garage.unmapped(shop.admin)).toHaveLength(1);
  });

  it('the director reads the list and cannot map; a master sees nothing', async () => {
    const client = await makeClient(database.db);
    const odd = await t.services.garage.create(client, other('01 C 111 CC'));
    const boss = await director();
    expect(await t.services.garage.unmapped(boss)).toHaveLength(1);
    await expect(
      t.services.garage.map(boss, odd.id, { modelId: shop.models.tracker }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const master = staffActorOf(await insertStaff(database.db, ['master']), ['master']);
    await expect(t.services.garage.unmapped(master)).rejects.toMatchObject({ code: 'forbidden' });
  });
});
