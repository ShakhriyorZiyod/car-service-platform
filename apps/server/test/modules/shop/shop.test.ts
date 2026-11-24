import type { Role } from '@cs/shared/vocabulary';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cancelReasons,
  outbox,
  shopOrders,
  statusHistory,
  stockLevels,
  stockMovements,
} from '../../../src/db/schema';
import { localDateOf } from '../../../src/lib/time';
import type { ProductInput } from '../../../src/modules/stock';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';
import { makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
let w: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  w = await setupWorkshop(t, database.db);
});

const shop = () => t.services.shop;
const stock = () => t.services.stock;
const MISSING = '019a0000-0000-7000-8000-000000000000';
let requestSeq = 0;
const requestId = () => `019a0000-0000-7000-8000-${String((requestSeq += 1)).padStart(12, '0')}`;

async function actorWith(roles: Role[]) {
  return staffActorOf(await insertStaff(database.db, roles), roles);
}

async function product(overrides: Partial<ProductInput> = {}, onHand = 5) {
  const category = await stock().products.createCategory(w.owner, {
    nameUz: `Cat ${Math.random()}`,
    nameRu: 'Cat',
    parentId: null,
  });
  const card = await stock().products.create(w.owner, {
    sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
    barcode: null,
    nameUz: 'Shampun',
    nameRu: 'Шампунь',
    descriptionUz: null,
    descriptionRu: null,
    categoryId: category.id,
    brand: null,
    unit: 'pcs',
    pack: '1 l',
    isForSale: true,
    isConsumable: false,
    sellPrice: 85_000,
    minQty: 0,
    ...overrides,
  });
  if (onHand > 0) {
    const draft = await stock().documents.create(w.admin, {
      kind: 'receipt',
      supplierId: null,
      invoiceNo: null,
      invoiceDate: null,
      reason: null,
      note: null,
      lines: [{ productId: card.id, qty: onHand, unitCost: 50_000 }],
    });
    await stock().documents.post(w.admin, draft.id);
  }
  return card;
}

async function levelOf(productId: string) {
  const [row] = await database.db
    .select()
    .from(stockLevels)
    .where(eq(stockLevels.productId, productId));
  return { onHand: Number(row?.onHand), reserved: Number(row?.reserved) };
}

const reasonId = async (code: string) =>
  (await database.db.select().from(cancelReasons).where(eq(cancelReasons.code, code)))[0]!.id;

async function order(productId: string, qty = 1, client?: Awaited<ReturnType<typeof makeClient>>) {
  const who = client ?? (await makeClient(database.db));
  const made = await shop().create(who, {
    requestId: requestId(),
    items: [{ productId, qty }],
    comment: null,
  });
  return { client: who, order: made };
}

const pay = (amount: number) => ({
  requestId: requestId(),
  payments: [{ method: 'cash' as const, amount }],
  receiptNo: 'R-100',
});

async function readyOrder(productId: string, qty = 1) {
  const made = await order(productId, qty);
  await shop().call(w.admin, made.order.id, { outcome: 'confirmed' });
  await shop().ready(w.admin, made.order.id);
  return made;
}

describe('placing an order (PLAN 9.5)', () => {
  it('reserves the goods, copies the price and tells the client and the admins', async () => {
    const item = await product({ sellPrice: 85_000 }, 5);
    const { client, order: made } = await order(item.id, 2);
    expect(made.status).toBe('new');
    expect(made.total).toBe(170_000);
    expect(made.items).toEqual([
      expect.objectContaining({ productId: item.id, price: 85_000, qty: 2, lineTotal: 170_000 }),
    ]);
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 2 });

    // A later price change does not touch the order.
    await stock().products.update(w.owner, item.id, { ...item, sellPrice: 99_000 });
    expect((await shop().get(client, made.id)).items[0]?.price).toBe(85_000);

    const messages = await database.db.select().from(outbox);
    const types = messages.map(
      (row) => (row.payload as { notification: { type: string } }).notification.type,
    );
    expect(types).toContain('shop.created');
    expect(types).toContain('staff.shop_order_new');
    const history = await database.db
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entity, 'shop_order'), eq(statusHistory.entityId, made.id)));
    expect(history.map((row) => row.toStatus)).toEqual(['new']);
  });

  it('needs a verified phone', async () => {
    const item = await product();
    const client = await makeClient(database.db, { phoneVerified: false });
    await expect(
      shop().create(client, {
        requestId: requestId(),
        items: [{ productId: item.id, qty: 1 }],
        comment: null,
      }),
    ).rejects.toMatchObject({ code: 'phone_required' });
  });

  it('the same request again gives the same order and reserves once', async () => {
    const item = await product({}, 5);
    const client = await makeClient(database.db);
    const input = {
      requestId: requestId(),
      items: [{ productId: item.id, qty: 2 }],
      comment: null,
    };
    const [first, second] = await Promise.all([
      shop().create(client, input),
      shop().create(client, input),
    ]);
    expect(second.id).toBe(first.id);
    expect(await shop().create(client, input)).toMatchObject({ id: first.id });
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 2 });
  });

  it('all or nothing: one line short and nothing is reserved', async () => {
    const plenty = await product({}, 5);
    const scarce = await product({}, 1);
    const client = await makeClient(database.db);
    await expect(
      shop().create(client, {
        requestId: requestId(),
        items: [
          { productId: plenty.id, qty: 2 },
          { productId: scarce.id, qty: 2 },
        ],
        comment: null,
      }),
    ).rejects.toMatchObject({
      code: 'out_of_stock',
      details: { paths: [`body.items.${scarce.id}`] },
    });
    expect(await levelOf(plenty.id)).toEqual({ onHand: 5, reserved: 0 });
    expect(await database.db.select().from(shopOrders)).toHaveLength(0);
  });

  it('100 clients after the last unit at once: one gets it, the rest out_of_stock', async () => {
    const item = await product({}, 1);
    const clients = await Promise.all(Array.from({ length: 100 }, () => makeClient(database.db)));
    const results = await Promise.allSettled(
      clients.map((client) =>
        shop().create(client, {
          requestId: requestId(),
          items: [{ productId: item.id, qty: 1 }],
          comment: null,
        }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const reasons = results.flatMap((result): unknown[] =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    expect(reasons).toHaveLength(99);
    for (const reason of reasons) expect(reason).toMatchObject({ code: 'out_of_stock' });
    expect(await levelOf(item.id)).toEqual({ onHand: 1, reserved: 1 });
    expect(await database.db.select().from(shopOrders)).toHaveLength(1);
  });

  it('a product not on sale cannot be ordered', async () => {
    const item = await product({ isForSale: false, isConsumable: true });
    await expect(order(item.id)).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('what the client sees (TZ 4.5)', () => {
  it('never the exact stock: only whether there is some', async () => {
    await product({ minQty: 2 }, 7);
    const [item] = await shop().products({ sort: 'popular' });
    expect(item).toMatchObject({ availability: 'in_stock', maxQty: 7 });
    expect(Object.keys(item ?? {})).not.toContain('free');
    expect(Object.keys(item ?? {})).not.toContain('onHand');
    const quote = await shop().quote([{ productId: item!.id, qty: 9 }]);
    expect(quote.lines[0]).toMatchObject({ problem: 'short', maxQty: 7 });
    expect(quote.canOrder).toBe(false);
  });

  it('somebody else’s order does not exist: 404', async () => {
    const item = await product();
    const { order: made } = await order(item.id);
    const stranger = await makeClient(database.db);
    await expect(shop().get(stranger, made.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      shop().cancel(stranger, made.id, { reasonId: await reasonId('changed_mind') }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('cancelling gives the reserve back', () => {
  it('the client, while new or confirmed; the admins hear of it', async () => {
    const item = await product({}, 5);
    const { client, order: made } = await order(item.id, 2);
    const cancelled = await shop().cancel(client, made.id, {
      reasonId: await reasonId('changed_mind'),
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelReason?.uz).toBe('Fikr o‘zgardi');
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 0 });
    const types = (await database.db.select().from(outbox)).map(
      (row) => (row.payload as { notification: { type: string } }).notification.type,
    );
    expect(types).toContain('staff.shop_client_cancelled');
  });

  it('the client may not cancel a gathered order, nor pick a staff reason', async () => {
    const item = await product({}, 5);
    const { client, order: made } = await order(item.id);
    await expect(
      shop().cancel(client, made.id, { reasonId: await reasonId('duplicate') }),
    ).rejects.toMatchObject({ code: 'validation' });
    await shop().call(w.admin, made.id, { outcome: 'confirmed' });
    await shop().ready(w.admin, made.id);
    await expect(
      shop().cancel(client, made.id, { reasonId: await reasonId('changed_mind') }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('the admin, until it is handed over', async () => {
    const item = await product({}, 5);
    const { order: made } = await readyOrder(item.id, 3);
    const cancelled = await shop().staffCancel(w.admin, made.id, {
      reasonId: await reasonId('duplicate'),
    });
    expect(cancelled.status).toBe('cancelled');
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 0 });
  });

  it('a refused call cancels with a reason', async () => {
    const item = await product({}, 5);
    const { order: made } = await order(item.id);
    await expect(shop().call(w.admin, made.id, { outcome: 'rejected' })).rejects.toMatchObject({
      code: 'validation',
    });
    const after = await shop().call(w.admin, made.id, {
      outcome: 'rejected',
      reasonId: await reasonId('duplicate'),
    });
    expect(after.status).toBe('cancelled');
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 0 });
  });
});

describe('the system cancels what waits too long', () => {
  it('a new order nobody confirmed in time: no_contact', async () => {
    const item = await product({}, 5);
    const { order: made } = await order(item.id, 2);
    const task = shop().tasks.find((candidate) => candidate.name === 'shop-expire')!;
    await task.run(t.clock.now());
    expect((await shop().staffGet(w.admin, made.id)).status).toBe('new');
    t.clock.advance(3 * 86_400_000);
    await task.run(t.clock.now());
    const after = await shop().staffGet(w.admin, made.id);
    expect(after.status).toBe('cancelled');
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 0 });
  });

  it('"no answer" stretches the hold', async () => {
    const item = await product({}, 5);
    const { order: made } = await order(item.id);
    const before = (await shop().staffGet(w.admin, made.id)).holdUntil!.at;
    const after = await shop().call(w.admin, made.id, { outcome: 'no_answer' });
    expect(after.status).toBe('new');
    expect(Date.parse(after.holdUntil!.at)).toBeGreaterThan(Date.parse(before));
    expect(after.calls).toHaveLength(1);
  });

  it('a gathered order nobody came for in 72 hours: not_picked_up', async () => {
    const item = await product({}, 5);
    const { order: made } = await readyOrder(item.id, 2);
    const task = shop().tasks.find((candidate) => candidate.name === 'shop-expire')!;
    t.clock.advance(71 * 3_600_000);
    await task.run(t.clock.now());
    expect((await shop().staffGet(w.admin, made.id)).status).toBe('ready_for_pickup');
    t.clock.advance(1 * 3_600_000);
    await task.run(t.clock.now());
    const after = await shop().staffGet(w.admin, made.id);
    expect(after.status).toBe('cancelled');
    expect(after.cancelReason?.uz).toBe('Muddatida olib ketilmadi');
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 0 });
  });
});

describe('handing over (PLAN 11)', () => {
  it('payments, receipt, the sale document and "completed" together', async () => {
    const item = await product({ sellPrice: 85_000 }, 5);
    const { client, order: made } = await readyOrder(item.id, 2);
    const done = await shop().checkout(w.admin, made.id, pay(170_000));
    expect(done.status).toBe('completed');
    expect(done.receipt?.receiptNo).toBe('R-100');
    expect(done.paymentLines).toHaveLength(1);
    expect(await levelOf(item.id)).toEqual({ onHand: 3, reserved: 0 });
    const sales = await database.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, item.id));
    expect(sales.map((row) => Number(row.delta))).toContain(-2);
    expect((await shop().get(client, made.id)).receiptNo).toBe('R-100');

    // The day's takings count the shop's money too.
    const cash = await t.services.payments.cashOf(localDateOf(t.clock.now()));
    expect(cash.total).toBe(170_000);
  });

  it('not before it is gathered, and the payments must add up', async () => {
    const item = await product({}, 5);
    const { order: made } = await order(item.id);
    await expect(shop().checkout(w.admin, made.id, pay(85_000))).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await shop().call(w.admin, made.id, { outcome: 'confirmed' });
    await shop().ready(w.admin, made.id);
    await expect(shop().checkout(w.admin, made.id, pay(1))).rejects.toMatchObject({
      code: 'payment_mismatch',
    });
    expect(await levelOf(item.id)).toEqual({ onHand: 5, reserved: 1 });
  });

  it('the same checkout again changes nothing', async () => {
    const item = await product({}, 5);
    const { order: made } = await readyOrder(item.id, 1);
    const input = pay(85_000);
    await Promise.all([
      shop().checkout(w.admin, made.id, input),
      shop().checkout(w.admin, made.id, input),
    ]);
    await shop().checkout(w.admin, made.id, input);
    expect(await levelOf(item.id)).toEqual({ onHand: 4, reserved: 0 });
    expect((await shop().staffGet(w.admin, made.id)).paymentLines).toHaveLength(1);
  });

  it('a discount within the admin’s limit lowers the total', async () => {
    const item = await product({ sellPrice: 100_000 }, 5);
    const { order: made } = await readyOrder(item.id, 1);
    await expect(
      shop().setDiscount(w.admin, made.id, {
        kind: 'percent',
        percent: 10,
        reason: 'Doimiy mijoz',
      }),
    ).rejects.toMatchObject({ code: 'discount_over_limit' });
    const after = await shop().setDiscount(w.admin, made.id, {
      kind: 'percent',
      percent: 5,
      reason: 'Doimiy mijoz',
    });
    expect(after.total).toBe(95_000);
    expect((await shop().checkout(w.admin, made.id, pay(95_000))).status).toBe('completed');
  });
});

describe('the quick sale at the counter', () => {
  it('sells from the free stock at once, without touching others’ reserve', async () => {
    const item = await product({ sellPrice: 20_000 }, 3);
    await order(item.id, 2);
    const sale = await shop().quickSale(w.admin, {
      clientId: null,
      items: [{ productId: item.id, qty: 1 }],
      ...pay(20_000),
    });
    expect(sale).toMatchObject({ status: 'completed', source: 'counter', total: 20_000 });
    expect(await levelOf(item.id)).toEqual({ onHand: 2, reserved: 2 });
    await expect(
      shop().quickSale(w.admin, {
        clientId: null,
        items: [{ productId: item.id, qty: 1 }],
        ...pay(20_000),
      }),
    ).rejects.toMatchObject({ code: 'out_of_stock' });
  });

  it('sent again it sells once', async () => {
    const item = await product({ sellPrice: 20_000 }, 3);
    const input = { clientId: null, items: [{ productId: item.id, qty: 1 }], ...pay(20_000) };
    // Twice at once (a double tap), then once more: one sale.
    const [first, second] = await Promise.all([
      shop().quickSale(w.admin, input),
      shop().quickSale(w.admin, input),
    ]);
    expect(second.id).toBe(first.id);
    expect((await shop().quickSale(w.admin, input)).id).toBe(first.id);
    expect(await levelOf(item.id)).toEqual({ onHand: 2, reserved: 0 });
  });
});

describe('who may do what in the shop', () => {
  it('the director reads, the master does not; only who takes money hands over', async () => {
    const item = await product({}, 5);
    const { order: made } = await order(item.id);
    const director = await actorWith(['director']);
    expect((await shop().staffList(director, { tab: 'new' })).map((row) => row.id)).toEqual([
      made.id,
    ]);
    expect((await shop().staffGet(director, made.id)).actions.canCall).toBe(false);
    await expect(shop().call(director, made.id, { outcome: 'confirmed' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      shop().staffList(await actorWith(['master']), { tab: 'new' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(shop().staffGet(w.admin, MISSING)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('the panel finds an order by its number', async () => {
    const item = await product({}, 5);
    const { order: made } = await order(item.id);
    await order(item.id);
    const found = await shop().staffList(w.admin, { tab: 'new', q: `№${made.number}` });
    expect(found.map((row) => row.id)).toEqual([made.id]);
    // The number names one order, whatever tab is open.
    const elsewhere = await shop().staffList(w.admin, { tab: 'done', q: String(made.number) });
    expect(elsewhere.map((row) => row.id)).toEqual([made.id]);
  });

  it('the panel finds the client by name or phone within the tab', async () => {
    const item = await product({}, 5);
    const aziz = await makeClient(database.db, { name: 'Aziz Karimov' });
    const { order: mine } = await order(item.id, 1, aziz);
    await order(item.id, 1, await makeClient(database.db, { name: 'Jasur Toirov' }));
    const byName = await shop().staffList(w.admin, { tab: 'new', q: 'karim' });
    expect(byName.map((row) => row.id)).toEqual([mine.id]);
    const byPhone = await shop().staffList(w.admin, { tab: 'new', q: aziz.phone!.slice(-9) });
    expect(byPhone.map((row) => row.id)).toEqual([mine.id]);
    expect(await shop().staffList(w.admin, { tab: 'done', q: 'karim' })).toEqual([]);
  });

  it('"Bugun" counts the new and the gathered', async () => {
    const item = await product({}, 5);
    await order(item.id);
    await readyOrder(item.id);
    expect(await shop().countsFor(w.admin)).toEqual({ newOrders: 1, readyForPickup: 1 });
    expect(await shop().countsFor(await actorWith(['master']))).toBeNull();
  });
});
