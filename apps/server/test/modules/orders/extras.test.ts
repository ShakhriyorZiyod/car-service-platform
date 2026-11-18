import { eq, notInArray } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, orderItems, orders, outbox, services } from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { jpeg } from '../../helpers/images';
import { createTestServices, type TestContext } from '../../helpers/services';
import { masterOf, orderInWork } from '../../helpers/work';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase({ maxConnections: 10 });
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const extras = () => t.services.extras;
const work = () => t.services.taskService;
const inWork = (options: { zones?: string[]; telegram?: boolean } = {}) =>
  orderInWork(t, database.db, shop, options);

const messages = async (type: string) =>
  (await database.db.select().from(outbox)).filter(
    (row) => (row.payload as { notification: { type: string } }).notification.type === type,
  );
const rowOf = async (id: string) =>
  (await database.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const itemOf = async (id: string) =>
  (await database.db.select().from(orderItems).where(eq(orderItems.id, id)))[0]!;

/** Adds the "Boshqa" zone (price to be agreed unless a price is given) as extra work. */
const addExtra = (
  orderId: string,
  input: { price?: number | null; comment?: string | null } = {},
) => extras().add(shop.admin, orderId, { serviceId: shop.zones.bumper, ...input });

describe('adding extra work (PLAN 9.3)', () => {
  it('only for an order in work, and only by the staff who write orders', async () => {
    const { order } = await inWork();
    const boss = staffActorOf(await insertStaff(database.db, ['director']), ['director']);
    await expect(
      extras().add(boss, order.id, { serviceId: shop.zones.bumper }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(extras().decideByPhone(boss, order.id, newId(), 'approved')).rejects.toMatchObject(
      { code: 'forbidden' },
    );

    // A confirmed order is not in work yet.
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 A 777 AA',
      color: null,
    });
    t.clock.set(at('2026-10-29 10:00'));
    const fresh = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-31 10:00'),
    });
    await t.services.adminOrders.call(shop.admin, fresh.id, { outcome: 'confirmed' });
    await expect(addExtra(fresh.id)).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('takes the price list’s price for the car’s class, a typed price, or "to be agreed"', async () => {
    const { order } = await inWork({ zones: [shop.zones.bonnet] });
    const fromList = await addExtra(order.id);
    const typed = await addExtra(order.id, { price: 750_000, comment: 'Chuqur chiziq' });
    const agreed = await addExtra(order.id, { price: null });
    const found = agreed.items.filter((item) => item.kind === 'extra');
    expect(found.map((item) => item.price).sort()).toEqual([null, 750_000, 1_600_000].sort());
    expect(found.every((item) => item.approval === 'pending' && item.progress === null)).toBe(true);
    expect(fromList.items.filter((item) => item.kind === 'extra')).toHaveLength(1);
    expect(typed.items.find((item) => item.price === 750_000)).toMatchObject({
      comment: 'Chuqur chiziq',
    });
  });

  it('changes nothing in the totals until the client agrees, and writes who did it', async () => {
    const { order } = await inWork({ zones: [shop.zones.bonnet] });
    const before = await rowOf(order.id);
    const added = await addExtra(order.id);
    expect(added).toMatchObject({
      subtotal: before.subtotal,
      total: before.total,
      unpricedCount: 0,
    });
    const [extra] = await database.db.select().from(orderItems).where(eq(orderItems.kind, 'extra'));
    expect(extra).toMatchObject({
      kind: 'extra',
      approval: 'pending',
      approvalVia: null,
      createdBy: shop.admin.userId,
    });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'order.extra.add')),
    ).toHaveLength(1);
  });

  it('asks the client in Telegram, once, with the total they would pay', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const added = await addExtra(order.id, { price: 500_000 });
    const told = await messages('extra.approval_request');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: client.userId });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;
    expect(told[0]?.payload).toMatchObject({
      notification: {
        itemId,
        price: 500_000,
        newTotal: added.total + 500_000,
        number: order.number,
      },
    });
  });

  it('a client without Telegram is not written to, and nothing fails', async () => {
    const { order } = await inWork({ zones: [shop.zones.bonnet], telegram: false });
    await expect(addExtra(order.id)).resolves.toBeDefined();
    expect(await messages('extra.approval_request')).toHaveLength(0);
  });

  it('refuses a zone that does not exist, or that is not offered for the car', async () => {
    const { order } = await inWork({ zones: [shop.zones.bonnet] });
    await expect(extras().add(shop.admin, order.id, { serviceId: newId() })).rejects.toMatchObject({
      code: 'validation',
    });
    const [unpriced] = await database.db
      .select()
      .from(services)
      .where(notInArray(services.id, Object.values(shop.zones)))
      .limit(1);
    await expect(
      extras().add(shop.admin, order.id, { serviceId: unpriced!.id }),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
  });
});

describe('the client’s answer (PLAN 9.3)', () => {
  it('agreeing adds the price to the order, writes how, and tells the admins once each', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const before = await rowOf(order.id);
    const added = await addExtra(order.id, { price: 500_000 });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;

    const answered = await extras().decideAsClient(client, itemId, 'approved', 'tma', order.id);
    expect(answered).toMatchObject({
      subtotal: before.subtotal + 500_000,
      total: before.total + 500_000,
    });
    expect(answered.items.find((item) => item.id === itemId)).toMatchObject({
      approval: 'approved',
      progress: 'queued',
    });
    const row = await rowOf(order.id);
    expect(row).toMatchObject({
      subtotal: before.subtotal + 500_000,
      total: before.total + 500_000,
    });
    expect(await itemOf(itemId)).toMatchObject({ approval: 'approved', approvalVia: 'tma' });
    expect((await itemOf(itemId)).approvalAt).toEqual(t.clock.now());

    const told = await messages('staff.extra_decided');
    expect(told.length).toBeGreaterThan(0);
    expect(new Set(told.map((m) => m.recipientId)).size).toBe(told.length);
    expect(told[0]?.payload).toMatchObject({
      notification: { decision: 'approved', via: 'tma', number: order.number },
    });
  });

  it('refusing leaves the total as it was and shows no progress', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const before = await rowOf(order.id);
    const added = await addExtra(order.id, { price: 500_000 });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;
    const answered = await extras().decideAsClient(client, itemId, 'rejected', 'bot');
    expect(answered).toMatchObject({ subtotal: before.subtotal, total: before.total });
    expect(answered.items.find((item) => item.id === itemId)).toMatchObject({
      approval: 'rejected',
      progress: null,
    });
    expect(await itemOf(itemId)).toMatchObject({ approvalVia: 'bot' });
  });

  it('a price "to be agreed" is agreed to without changing the sum, and counts as unpriced', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const before = await rowOf(order.id);
    const added = await addExtra(order.id, { price: null });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;
    expect(added.unpricedCount).toBe(0); // not counted while it waits
    const answered = await extras().decideAsClient(client, itemId, 'approved', 'tma');
    expect(answered).toMatchObject({ subtotal: before.subtotal, unpricedCount: 1 });
  });

  it('only once: the second answer, even the same, is already_decided', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const added = await addExtra(order.id, { price: 500_000 });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;
    await extras().decideAsClient(client, itemId, 'approved', 'tma');
    await expect(extras().decideAsClient(client, itemId, 'approved', 'bot')).rejects.toMatchObject({
      code: 'already_decided',
    });
    await expect(extras().decideAsClient(client, itemId, 'rejected', 'tma')).rejects.toMatchObject({
      code: 'already_decided',
    });
    expect(await itemOf(itemId)).toMatchObject({ approval: 'approved', approvalVia: 'tma' });
    // The total grew once.
    expect((await rowOf(order.id)).total).toBe(added.total + 500_000);
  });

  it('two answers at once: one is taken, the other is already_decided, the total grows once', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const added = await addExtra(order.id, { price: 500_000 });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;
    const results = await Promise.allSettled([
      extras().decideAsClient(client, itemId, 'approved', 'tma'),
      extras().decideAsClient(client, itemId, 'approved', 'bot'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await rowOf(order.id)).total).toBe(added.total + 500_000);
  });

  it('only the order’s owner can answer; another client, or a wrong order, finds nothing', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const other = await inWork({ zones: [shop.zones.bonnet] });
    const added = await addExtra(order.id, { price: 500_000 });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;

    await expect(
      extras().decideAsClient(other.client, itemId, 'approved', 'tma'),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      extras().decideAsClient(client, itemId, 'approved', 'tma', other.order.id),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(extras().decideAsClient(client, newId(), 'approved', 'tma')).rejects.toMatchObject(
      { code: 'not_found' },
    );
    // A zone of the main order is not "extra work" and cannot be answered.
    await expect(
      extras().decideAsClient(client, order.items[0]!.id, 'approved', 'tma'),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(await itemOf(itemId)).toMatchObject({ approval: 'pending' });
  });

  it('not once the order has left the work: nothing is left to ask', async () => {
    const { client, order } = await inWork({ zones: [shop.zones.bonnet] });
    const added = await addExtra(order.id, { price: 500_000 });
    const itemId = added.items.find((item) => item.kind === 'extra')!.id;
    await database.db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, order.id));
    await expect(extras().decideAsClient(client, itemId, 'approved', 'tma')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });
});

describe('the admin writes down the answer given by phone (PLAN 9.3)', () => {
  it('marks it approved or refused "by phone", audited, without telling the admins', async () => {
    const { order } = await inWork({ zones: [shop.zones.bonnet] });
    const before = await rowOf(order.id);
    const added = await addExtra(order.id, { price: 500_000 });
    const id = added.items.find((item) => item.kind === 'extra')!.id;
    const done = await extras().decideByPhone(shop.admin, order.id, id, 'approved');
    expect(done).toMatchObject({ total: before.total + 500_000 });
    expect(await itemOf(id)).toMatchObject({ approval: 'approved', approvalVia: 'phone' });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'order.extra.decide')),
    ).toHaveLength(1);
    expect(await messages('staff.extra_decided')).toHaveLength(0);
    await expect(
      extras().decideByPhone(shop.admin, order.id, id, 'rejected'),
    ).rejects.toMatchObject({ code: 'already_decided' });
  });
});

describe('extra work and the order becoming ready (PLAN 9.1)', () => {
  it('an unanswered extra holds the order back; once answered, it is done like any zone', async () => {
    const { client, order, itemIds } = await inWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf(database.db);
    const main = await work().create(shop.admin, order.id, {
      masterId: master.userId,
      itemIds,
      instruction: '',
    });
    await work().start(master, main.id);
    await work().putPhoto(master, main.id, {
      mediaId: newId(),
      kind: 'after',
      bytes: jpeg(900, 700),
    });
    await work().submit(master, main.id, 'Tayyor');

    const added = await addExtra(order.id, { price: 500_000 });
    const extraId = added.items.find((item) => item.kind === 'extra')!.id;
    await work().accept(shop.admin, main.id);
    expect((await rowOf(order.id)).status).toBe('in_work'); // the client has not answered

    // The extra cannot be given to a master before the client agrees.
    await expect(
      work().create(shop.admin, order.id, {
        masterId: master.userId,
        itemIds: [extraId],
        instruction: '',
      }),
    ).rejects.toMatchObject({ code: 'item_unavailable' });
    await extras().decideAsClient(client, extraId, 'approved', 'tma');
    expect((await rowOf(order.id)).status).toBe('in_work'); // agreed, but not yet done

    const second = await work().create(shop.admin, order.id, {
      masterId: master.userId,
      itemIds: [extraId],
      instruction: '',
    });
    await work().start(master, second.id);
    await work().putPhoto(master, second.id, {
      mediaId: newId(),
      kind: 'after',
      bytes: jpeg(900, 700),
    });
    await work().submit(master, second.id, '');
    await work().accept(shop.admin, second.id);
    expect(await rowOf(order.id)).toMatchObject({ status: 'ready_for_pickup' });
  });

  it('refusing the last open extra makes the order ready at once', async () => {
    const { client, order, itemIds } = await inWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf(database.db);
    const main = await work().create(shop.admin, order.id, {
      masterId: master.userId,
      itemIds,
      instruction: '',
    });
    await work().start(master, main.id);
    await work().putPhoto(master, main.id, {
      mediaId: newId(),
      kind: 'after',
      bytes: jpeg(900, 700),
    });
    await work().submit(master, main.id, '');
    const added = await addExtra(order.id);
    await work().accept(shop.admin, main.id);
    expect((await rowOf(order.id)).status).toBe('in_work');

    await extras().decideAsClient(
      client,
      added.items.find((item) => item.kind === 'extra')!.id,
      'rejected',
      'tma',
    );
    expect((await rowOf(order.id)).status).toBe('ready_for_pickup');
    expect(await messages('order.ready')).toHaveLength(1);
  });
});

describe('how far each zone has got, for the client (design T6)', () => {
  it('queued, then in progress, then ready; nothing before the work begins', async () => {
    const { client, order, itemIds } = await inWork();
    const master = await masterOf(database.db);
    const progress = async () =>
      Object.fromEntries(
        (await t.services.orders.get(client, order.id)).items.map((item) => [
          item.id,
          item.progress,
        ]),
      );

    expect(await progress()).toEqual({ [itemIds[0]!]: 'queued', [itemIds[1]!]: 'queued' });
    const first = await work().create(shop.admin, order.id, {
      masterId: master.userId,
      itemIds: [itemIds[0]!],
      instruction: '',
    });
    expect(await progress()).toEqual({ [itemIds[0]!]: 'queued', [itemIds[1]!]: 'queued' });
    await work().start(master, first.id);
    expect(await progress()).toEqual({ [itemIds[0]!]: 'in_progress', [itemIds[1]!]: 'queued' });
    await work().putPhoto(master, first.id, {
      mediaId: newId(),
      kind: 'after',
      bytes: jpeg(900, 700),
    });
    await work().submit(master, first.id, '');
    expect(await progress()).toEqual({ [itemIds[0]!]: 'in_progress', [itemIds[1]!]: 'queued' });
    await work().accept(shop.admin, first.id);
    expect(await progress()).toEqual({ [itemIds[0]!]: 'ready', [itemIds[1]!]: 'queued' });
  });

  it('is empty until the car is taken in: a confirmed order shows none', async () => {
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 C 333 CC',
      color: null,
    });
    const order = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: at('2026-10-30 10:00'),
    });
    await t.services.adminOrders.call(shop.admin, order.id, { outcome: 'confirmed' });
    expect((await t.services.orders.get(client, order.id)).items.map((i) => i.progress)).toEqual([
      null,
    ]);
  });
});
