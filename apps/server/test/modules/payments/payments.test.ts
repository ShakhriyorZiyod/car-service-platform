import { and, eq, gte, lt } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  auditLog,
  fiscalReceipts,
  orders,
  outbox,
  payments,
  reviews,
  statusHistory,
} from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import type { ClientActor } from '../../../src/platform/actors';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';
import { orderInWork, orderReady } from '../../helpers/work';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase({ maxConnections: 10 });
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const pay = () => t.services.payments;
const admin = () => t.services.adminOrders;
const ready = (options: { zones?: string[]; telegram?: boolean } = {}) =>
  orderReady(t, database.db, shop, options);
const inWork = (options: { zones?: string[]; telegram?: boolean } = {}) =>
  orderInWork(t, database.db, shop, options);
const director = async () =>
  staffActorOf(await insertStaff(database.db, ['director']), ['director']);

const rowOf = async (id: string) =>
  (await database.db.select().from(orders).where(eq(orders.id, id)))[0]!;
const messages = async (type: string) =>
  (await database.db.select().from(outbox)).filter(
    (row) => (row.payload as { notification: { type: string } }).notification.type === type,
  );
const auditOf = async (action: string) =>
  database.db.select().from(auditLog).where(eq(auditLog.action, action));

/** Pays the whole total in cash with a fresh key. */
const payInCash = (orderId: string, total: number, extra: { requestId?: string } = {}) =>
  pay().checkout(shop.admin, orderId, {
    requestId: extra.requestId ?? newId(),
    payments: [{ method: 'cash', amount: total }],
    receiptNo: 'K-000123',
  });

describe('checkout (PLAN 9.1, 11)', () => {
  it('payments, the receipt and "completed" are written together, and the client is asked to rate', async () => {
    const { order, client } = await ready();
    expect(order.total).toBe(3_000_000);
    t.clock.set(at('2026-10-30 11:40'));

    const result = await pay().checkout(shop.admin, order.id, {
      requestId: newId(),
      payments: [
        { method: 'cash', amount: 1_000_000 },
        { method: 'card_terminal', amount: 2_000_000 },
      ],
      receiptNo: '  K-000123 ',
    });

    expect(result.order.status).toBe('completed');
    expect(result.receipt).toMatchObject({ receiptNo: 'K-000123', amount: 3_000_000 });
    expect(result.payments.map(({ method, amount }) => ({ method, amount }))).toEqual([
      { method: 'cash', amount: 1_000_000 },
      { method: 'card_terminal', amount: 2_000_000 },
    ]);
    const row = await rowOf(order.id);
    expect(row.completedAt).toEqual(t.clock.now());
    const steps = await database.db
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entityId, order.id), eq(statusHistory.toStatus, 'completed')));
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ fromStatus: 'ready_for_pickup', actorId: shop.admin.userId });

    const told = await messages('order.completed');
    expect(told).toHaveLength(1);
    expect(told[0]?.recipientId).toBe(client.userId);
    expect(told[0]?.payload).toMatchObject({
      notification: { orderId: order.id, total: 3_000_000, receiptNo: 'K-000123' },
    });
    expect(await auditOf('order.checkout')).toHaveLength(1);
  });

  it('the payments must add up to the total: payment_mismatch, and nothing is written', async () => {
    const { order } = await ready();
    for (const amounts of [[2_999_999], [3_000_001], [1_000_000, 1_999_999]]) {
      await expect(
        pay().checkout(shop.admin, order.id, {
          requestId: newId(),
          payments: amounts.map((amount, index) => ({
            method: index === 0 ? 'cash' : 'transfer',
            amount,
          })),
          receiptNo: 'K-1',
        }),
      ).rejects.toMatchObject({ code: 'payment_mismatch' });
    }
    expect(await database.db.select().from(payments)).toHaveLength(0);
    expect(await database.db.select().from(fiscalReceipts)).toHaveLength(0);
    expect((await rowOf(order.id)).status).toBe('ready_for_pickup');
  });

  it('without a receipt number it is refused', async () => {
    const { order } = await ready();
    await expect(
      pay().checkout(shop.admin, order.id, {
        requestId: newId(),
        payments: [{ method: 'cash', amount: 3_000_000 }],
        receiptNo: '   ',
      }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.receiptNo'] } });
    expect((await rowOf(order.id)).status).toBe('ready_for_pickup');
  });

  it('not before the car is ready: invalid_transition', async () => {
    const { order } = await inWork();
    await expect(payInCash(order.id, order.total)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('a zone still "to be agreed" blocks it until it is priced', async () => {
    const { order } = await ready({ zones: [shop.zones.bonnet, shop.zones.other] });
    expect(order.unpricedCount).toBe(1);
    await expect(payInCash(order.id, order.total)).rejects.toMatchObject({
      code: 'unpriced_items',
    });

    const unpriced = order.items.find((item) => item.price === null)!;
    const priced = await admin().priceItem(shop.admin, order.id, unpriced.id, 450_000);
    expect(priced.total).toBe(1_400_000 + 450_000);
    expect(priced.unpricedCount).toBe(0);
    // Once priced, the price is fixed.
    await expect(
      admin().priceItem(shop.admin, order.id, unpriced.id, 500_000),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    expect(await auditOf('order.item.price')).toHaveLength(1);

    await expect(payInCash(order.id, priced.total)).resolves.toMatchObject({
      order: { status: 'completed' },
    });
  });

  it('only who may take money: the director may not', async () => {
    const { order } = await ready();
    const boss = await director();
    await expect(
      pay().checkout(boss, order.id, {
        requestId: newId(),
        payments: [{ method: 'cash', amount: 3_000_000 }],
        receiptNo: 'K-1',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // They may look at it, and are offered nothing to do.
    const view = await pay().handover(boss, order.id);
    expect(view.order.actions).toMatchObject({ canCheckout: false, canDiscount: false });
  });
});

describe('checkout happens once (PLAN 2, rule 12)', () => {
  it('the same request again gives the same result and writes nothing more', async () => {
    const { order } = await ready();
    const requestId = newId();
    const first = await payInCash(order.id, 3_000_000, { requestId });
    const again = await payInCash(order.id, 3_000_000, { requestId });
    expect(again.receipt).toEqual(first.receipt);
    expect(again.payments).toEqual(first.payments);
    expect(await database.db.select().from(payments)).toHaveLength(1);
    expect(await database.db.select().from(fiscalReceipts)).toHaveLength(1);
    expect(await messages('order.completed')).toHaveLength(1);
  });

  it('the same request sent twice at once still pays once', async () => {
    const { order } = await ready();
    const requestId = newId();
    const results = await Promise.allSettled([
      payInCash(order.id, 3_000_000, { requestId }),
      payInCash(order.id, 3_000_000, { requestId }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await database.db.select().from(payments)).toHaveLength(1);
    expect(await database.db.select().from(fiscalReceipts)).toHaveLength(1);
  });

  it('two different checkouts at once: one passes, the other is refused', async () => {
    const { order } = await ready();
    const results = await Promise.allSettled([
      payInCash(order.id, 3_000_000),
      payInCash(order.id, 3_000_000),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((result) => result.status === 'rejected');
    expect(refused?.reason).toMatchObject({ code: 'invalid_transition' });
    expect(await database.db.select().from(payments)).toHaveLength(1);
    expect(await database.db.select().from(fiscalReceipts)).toHaveLength(1);
  });

  it('a key used for one order cannot pay for another', async () => {
    const first = await ready();
    const second = await ready();
    const requestId = newId();
    await payInCash(first.order.id, 3_000_000, { requestId });
    await expect(payInCash(second.order.id, 3_000_000, { requestId })).rejects.toMatchObject({
      code: 'validation',
    });
    expect((await rowOf(second.order.id)).status).toBe('ready_for_pickup');
  });
});

describe('correcting a payment method (PLAN 11)', () => {
  it('only the owner, the amount stays, and it goes to the audit log', async () => {
    const { order } = await ready();
    const done = await payInCash(order.id, 3_000_000);
    const payment = done.payments[0]!;
    expect(done.canCorrectPayments).toBe(false); // the admin may not

    await expect(
      pay().correctMethod(shop.admin, payment.id, 'card_terminal'),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const corrected = await pay().correctMethod(shop.owner, payment.id, 'card_terminal');
    expect(corrected.canCorrectPayments).toBe(true);
    expect(corrected.payments).toEqual([
      { ...payment, method: 'card_terminal', amount: 3_000_000 },
    ]);
    const entries = await auditOf('payment.method.correct');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: shop.owner.userId,
      before: { method: 'cash', amount: 3_000_000 },
      after: { method: 'card_terminal', amount: 3_000_000 },
    });

    // The same method again changes nothing and is not written down.
    await pay().correctMethod(shop.owner, payment.id, 'card_terminal');
    expect(await auditOf('payment.method.correct')).toHaveLength(1);
    await expect(pay().correctMethod(shop.owner, newId(), 'cash')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('the day’s takings (TZ 16.4)', () => {
  it('equal the payments of the day to the so‘m; another day’s money is not in them', async () => {
    const first = await ready();
    const second = await ready();
    t.clock.set(at('2026-10-30 12:00'));
    await pay().checkout(shop.admin, first.order.id, {
      requestId: newId(),
      payments: [
        { method: 'cash', amount: 1_000_000 },
        { method: 'card_terminal', amount: 2_000_000 },
      ],
      receiptNo: 'K-1',
    });
    await pay().checkout(shop.admin, second.order.id, {
      requestId: newId(),
      payments: [
        { method: 'cash', amount: 1_340_000 },
        { method: 'transfer', amount: 1_660_000 },
      ],
      receiptNo: 'K-2',
    });
    // Money of the evening before, just before midnight in Tashkent.
    await database.db.insert(payments).values({
      orderId: first.order.id,
      method: 'cash',
      amount: 777,
      receivedBy: shop.admin.userId,
      receivedAt: at('2026-10-29 23:59'),
    });

    const today = await t.services.dashboard.today(shop.admin);
    const from = at('2026-10-30 00:00');
    const to = at('2026-10-31 00:00');
    const rows = await database.db
      .select()
      .from(payments)
      .where(and(gte(payments.receivedAt, from), lt(payments.receivedAt, to)));
    const paid = rows.reduce((sum, row) => sum + row.amount, 0);
    expect(today.cash).toEqual({
      byMethod: [
        { method: 'cash', amount: 2_340_000 },
        { method: 'card_terminal', amount: 2_000_000 },
        { method: 'transfer', amount: 1_660_000 },
      ],
      total: paid,
      receipts: 2,
    });
    expect(paid).toBe(6_000_000);

    // The director reads "Bugun" but is not shown the money.
    expect((await t.services.dashboard.today(await director())).cash).toBeNull();
  });

  it('the reports waiting for a check are on "Bugun" for the admin', async () => {
    await ready(); // accepted: no longer waiting
    const today = await t.services.dashboard.today(shop.admin);
    expect(today.reports).toEqual([]);
    expect((await t.services.dashboard.today(await director())).reports).toEqual([]);
  });
});

describe('the discount (PLAN 11)', () => {
  it('an admin up to 5% exactly; one so‘m more is the owner’s', async () => {
    const { order } = await inWork();
    const percent = await admin().setDiscount(shop.admin, order.id, {
      input: { kind: 'percent', percent: 5 },
      reason: 'Doimiy mijoz',
    });
    expect(percent.discount).toEqual({ amount: 150_000, percent: 5, reason: 'Doimiy mijoz' });
    expect(percent.total).toBe(2_850_000);

    await expect(
      admin().setDiscount(shop.admin, order.id, {
        input: { kind: 'amount', amount: 150_001 },
        reason: 'Doimiy mijoz',
      }),
    ).rejects.toMatchObject({ code: 'discount_over_limit' });
    expect((await rowOf(order.id)).discountAmount).toBe(150_000);

    const owner = await admin().setDiscount(shop.owner, order.id, {
      input: { kind: 'amount', amount: 1_000_000 },
      reason: 'Kechikish uchun',
    });
    expect(owner.discount).toEqual({ amount: 1_000_000, percent: null, reason: 'Kechikish uchun' });
    expect(owner.total).toBe(2_000_000);
    await expect(
      admin().setDiscount(shop.owner, order.id, {
        input: { kind: 'amount', amount: 3_000_001 },
        reason: 'x',
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    const cleared = await admin().setDiscount(shop.admin, order.id, null);
    expect(cleared.discount).toBeNull();
    expect(cleared.total).toBe(3_000_000);
    expect(await auditOf('order.discount')).toHaveLength(3);
  });

  it('the limit is the owner’s setting', async () => {
    const settings = await t.services.workshop.settings.current();
    await t.services.workshop.settings.update(shop.owner, {
      ...settings,
      rules: { ...settings.rules, adminDiscountLimitPct: 10 },
    });
    const { order } = await inWork();
    await expect(
      admin().setDiscount(shop.admin, order.id, {
        input: { kind: 'percent', percent: 10 },
        reason: 'Aksiya',
      }),
    ).resolves.toMatchObject({ total: 2_700_000 });
  });

  it('nobody but who takes money; not after the car was handed over', async () => {
    const { order } = await ready();
    await expect(
      admin().setDiscount(await director(), order.id, {
        input: { kind: 'percent', percent: 1 },
        reason: 'x',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await payInCash(order.id, 3_000_000);
    await expect(
      admin().setDiscount(shop.owner, order.id, {
        input: { kind: 'percent', percent: 1 },
        reason: 'x',
      }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('agreed extra work: a percentage grows with the subtotal, an amount stays', async () => {
    const { order } = await inWork();
    await admin().setDiscount(shop.admin, order.id, {
      input: { kind: 'percent', percent: 5 },
      reason: 'Doimiy mijoz',
    });
    const asked = await t.services.extras.add(shop.admin, order.id, {
      serviceId: shop.zones.other,
      price: 1_000_000,
    });
    const extra = asked.items.find((item) => item.kind === 'extra')!;
    // The client is told the total they would pay, the discount included, in the app and the bot.
    expect(extra.totalIfApproved).toBe(3_800_000);
    const [request] = await messages('extra.approval_request');
    expect(request?.payload).toMatchObject({ notification: { newTotal: 3_800_000 } });

    const agreed = await t.services.extras.decideByPhone(
      shop.admin,
      order.id,
      extra.id,
      'approved',
    );
    expect(agreed.subtotal).toBe(4_000_000);
    expect(agreed.discount?.amount).toBe(200_000);
    expect(agreed.total).toBe(3_800_000);

    const other = await inWork();
    await admin().setDiscount(shop.admin, other.order.id, {
      input: { kind: 'amount', amount: 150_000 },
      reason: 'Doimiy mijoz',
    });
    const added = await t.services.extras.add(shop.admin, other.order.id, {
      serviceId: shop.zones.other,
      price: 1_000_000,
    });
    const second = added.items.find((item) => item.kind === 'extra')!;
    const kept = await t.services.extras.decideByPhone(
      shop.admin,
      other.order.id,
      second.id,
      'approved',
    );
    expect(kept.discount?.amount).toBe(150_000);
    expect(kept.total).toBe(3_850_000);
  });

  it('zones edited before the work: a percentage is taken again, an amount is cut to the subtotal', async () => {
    t.clock.set(at('2026-10-29 10:00'));
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 A 777 AA',
      color: null,
    });
    const order = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet, shop.zones.bumper],
      startsAt: at('2026-10-30 10:00'),
    });
    await admin().setDiscount(shop.admin, order.id, {
      input: { kind: 'percent', percent: 5 },
      reason: 'Doimiy mijoz',
    });
    const fewer = await admin().updateItems(shop.admin, order.id, [
      { serviceId: shop.zones.bonnet },
    ]);
    expect(fewer.subtotal).toBe(1_400_000);
    expect(fewer.discount).toEqual({ amount: 70_000, percent: 5, reason: 'Doimiy mijoz' });
    expect(fewer.total).toBe(1_330_000);

    await admin().setDiscount(shop.owner, order.id, {
      input: { kind: 'amount', amount: 1_000_000 },
      reason: 'Kechikish',
    });
    const cheaper = await admin().updateItems(shop.admin, order.id, [
      { serviceId: shop.zones.bonnet, price: 600_000 },
    ]);
    expect(cheaper.discount?.amount).toBe(600_000);
    expect(cheaper.total).toBe(0);
  });
});

describe('the client’s rating (PLAN 7.8, 12)', () => {
  const rate = (client: ClientActor, orderId: string, rating: number, text?: string) =>
    t.services.orders.review(client, orderId, { rating, ...(text !== undefined && { text }) });

  it('only for a finished order, only by its client, once', async () => {
    const { order, client } = await ready();
    await expect(rate(client, order.id, 5)).rejects.toMatchObject({ code: 'invalid_transition' });
    await payInCash(order.id, 3_000_000);

    const stranger = await makeClient(database.db);
    await expect(rate(stranger, order.id, 1)).rejects.toMatchObject({ code: 'not_found' });

    const rated = await rate(client, order.id, 5, '  Juda yaxshi  ');
    expect(rated.review).toEqual({ rating: 5, text: 'Juda yaxshi' });
    expect(rated).toMatchObject({ canRate: false, canComment: false });
    await expect(rate(client, order.id, 1)).rejects.toMatchObject({ code: 'already_decided' });
    await expect(rate(client, order.id, 5, 'Yana')).rejects.toMatchObject({
      code: 'already_decided',
    });
    const [row] = await database.db.select().from(reviews).where(eq(reviews.orderId, order.id));
    expect(row).toMatchObject({ rating: 5, text: 'Juda yaxshi', clientId: client.userId });
  });

  it('stars in the bot, words in the app afterwards; the stars cannot be changed', async () => {
    const { order, client } = await ready();
    const done = await payInCash(order.id, 3_000_000);
    expect(done.order).toMatchObject({ status: 'completed' });
    expect(await t.services.orders.get(client, order.id)).toMatchObject({
      canRate: true,
      canComment: false,
      review: null,
    });

    // The bot's button sends only the stars.
    const starred = await rate(client, order.id, 4);
    expect(starred).toMatchObject({ review: { rating: 4, text: null }, canComment: true });
    await expect(rate(client, order.id, 5, 'Zo‘r')).rejects.toMatchObject({
      code: 'already_decided',
    });
    const worded = await rate(client, order.id, 4, 'Zo‘r');
    expect(worded).toMatchObject({ review: { rating: 4, text: 'Zo‘r' }, canComment: false });
  });
});

describe('what the client sees of the result (design T12)', () => {
  it('the work’s photos and the payment, only of their own order', async () => {
    const { order, client } = await ready();
    await pay().checkout(shop.admin, order.id, {
      requestId: newId(),
      payments: [{ method: 'card_terminal', amount: 3_000_000 }],
      receiptNo: 'K-77',
    });
    const result = await pay().resultForClient(client, order.id);
    expect(result.payments).toEqual([{ method: 'card_terminal', amount: 3_000_000 }]);
    expect(result.receiptNo).toBe('K-77');
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0]?.before).toHaveLength(1);
    expect(result.photos[0]?.after).toHaveLength(1);
    expect(result.photos[0]?.after[0]?.url).toMatch(/^\/media\//);

    const stranger = await makeClient(database.db);
    await expect(pay().resultForClient(stranger, order.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('the handover names the master of each zone', async () => {
    const { order, master } = await ready();
    const view = await pay().handover(shop.admin, order.id);
    expect(view.masters).toEqual(
      order.items.map((item) => ({ itemId: item.id, masterName: master.fullName })),
    );
    expect(view.waitingMin).toBe(0);
    t.clock.set(at('2026-10-30 11:40'));
    expect((await pay().handover(shop.admin, order.id)).waitingMin).toBe(40);
    expect(view.order.actions).toMatchObject({ canCheckout: true, canDiscount: true });
  });
});
