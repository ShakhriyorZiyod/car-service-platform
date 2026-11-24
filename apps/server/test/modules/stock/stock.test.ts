import type { Role } from '@cs/shared/vocabulary';
import { asc, eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog, outbox, stockLevels, stockMovements } from '../../../src/db/schema';
import type { ProductInput } from '../../../src/modules/stock';
import { seedReference } from '../../../src/db/seeds/reference';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { jpeg } from '../../helpers/images';
import { createTestServices, type TestContext } from '../../helpers/services';
import { setupWorkshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const stock = () => t.services.stock;

async function actorWith(roles: Role[]) {
  return staffActorOf(await insertStaff(database.db, roles), roles);
}
const owner = () => actorWith(['owner']);
const admin = () => actorWith(['admin']);

const MISSING = '019a0000-0000-7000-8000-000000000000';

async function category(name = 'Shampunlar') {
  return stock().products.createCategory(await owner(), {
    nameUz: name,
    nameRu: name,
    parentId: null,
  });
}

async function product(overrides: Partial<ProductInput> = {}) {
  const categoryId = overrides.categoryId ?? (await category(`Cat ${Math.random()}`)).id;
  return stock().products.create(await owner(), {
    sku: `SKU-${Math.random().toString(36).slice(2, 8)}`,
    barcode: null,
    nameUz: 'Shampun',
    nameRu: 'Шампунь',
    descriptionUz: null,
    descriptionRu: null,
    categoryId,
    brand: null,
    unit: 'pcs',
    pack: '1 l',
    isForSale: true,
    isConsumable: false,
    sellPrice: 85_000,
    minQty: 0,
    ...overrides,
  });
}

const line = (productId: string, qty: number, unitCost: number | null = null) => ({
  productId,
  qty,
  unitCost,
});

const header = {
  supplierId: null,
  invoiceNo: null,
  invoiceDate: null,
  reason: null,
  note: null,
};

async function receive(productId: string, qty: number, unitCost: number) {
  const actor = await admin();
  const draft = await stock().documents.create(actor, {
    kind: 'receipt',
    ...header,
    lines: [line(productId, qty, unitCost)],
  });
  return stock().documents.post(actor, draft.id);
}

async function levelOf(productId: string) {
  const [row] = await database.db
    .select()
    .from(stockLevels)
    .where(eq(stockLevels.productId, productId));
  return row;
}

describe('who may do what in the warehouse (PLAN 8)', () => {
  it('only the owner writes product cards, categories and suppliers', async () => {
    for (const roles of [['admin'], ['director'], ['master']] as Role[][]) {
      const actor = await actorWith(roles);
      await expect(
        stock().products.createCategory(actor, { nameUz: 'X', nameRu: 'X', parentId: null }),
      ).rejects.toMatchObject({ code: 'forbidden' });
      await expect(
        stock().products.createSupplier(actor, { name: 'X', phone: null, inn: null, note: null }),
      ).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('the admin and the owner write documents; the director only reads them', async () => {
    const item = await product();
    const draft = { kind: 'receipt' as const, ...header, lines: [line(item.id, 1, 10)] };
    await expect(
      stock().documents.create(await actorWith(['director']), draft),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      stock().documents.create(await actorWith(['master']), draft),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const made = await stock().documents.create(await admin(), draft);
    expect((await stock().documents.get(await actorWith(['director']), made.id)).id).toBe(made.id);
    await expect(
      stock().levels.list(await actorWith(['master']), { filter: 'all' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('purchase prices reach the director and the owner, not the admin (TZ 2)', async () => {
    const item = await product();
    await receive(item.id, 10, 52_000);
    const seen = async (roles: Role[]) => {
      const actor = await actorWith(roles);
      const [row] = await stock().levels.list(actor, { filter: 'all' });
      const [card] = await stock().products.list(actor);
      const page = await stock().levels.movements(actor, { limit: 10 });
      return [row?.costs ?? null, card?.costs ?? null, page.items[0]?.unitCost ?? null];
    };
    expect(await seen(['admin'])).toEqual([null, null, null]);
    expect(await seen(['director'])).toEqual([
      { avgCost: 52_000, value: 520_000 },
      { avgCost: 52_000, lastCost: 52_000 },
      52_000,
    ]);
    expect((await seen(['owner']))[0]).toEqual({ avgCost: 52_000, value: 520_000 });
  });
});

describe('product cards', () => {
  it('a new product starts with an empty stock', async () => {
    const item = await product();
    expect(item.stock).toEqual({ onHand: 0, reserved: 0, free: 0, state: 'out' });
    expect(await levelOf(item.id)).toMatchObject({ onHand: 0, reserved: 0 });
  });

  it('an article and a barcode belong to one product', async () => {
    const first = await product({ sku: 'SH-NC1', barcode: '4600000000017' });
    await expect(product({ sku: 'sh-nc1' })).rejects.toMatchObject({ code: 'sku_taken' });
    await expect(product({ barcode: '4600000000017' })).rejects.toMatchObject({
      code: 'barcode_taken',
    });
    await expect(
      stock().products.update(await owner(), first.id, { sku: 'SH-NC2' }),
    ).resolves.toMatchObject({ sku: 'SH-NC2' });
  });

  it('goods for sale are pieces with a price', async () => {
    await expect(product({ unit: 'l' })).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.unit'] },
    });
    await expect(product({ sellPrice: null })).rejects.toMatchObject({
      details: { paths: ['body.sellPrice'] },
    });
    await expect(
      product({ isForSale: false, isConsumable: true, unit: 'l', sellPrice: null }),
    ).resolves.toMatchObject({ unit: 'l' });
  });

  it('the unit is fixed once the stock has moved', async () => {
    const item = await product({ isForSale: false, isConsumable: true, sellPrice: null });
    await expect(
      stock().products.update(await owner(), item.id, { unit: 'l' }),
    ).resolves.toMatchObject({ unit: 'l' });
    await receive(item.id, 2, 1_000);
    await expect(
      stock().products.update(await owner(), item.id, { unit: 'kg' }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.unit'] } });
  });

  it('a category has two levels at most', async () => {
    const top = await category('Aksessuarlar');
    const child = await stock().products.createCategory(await owner(), {
      nameUz: 'Sochiqlar',
      nameRu: 'Полотенца',
      parentId: top.id,
    });
    await expect(
      stock().products.createCategory(await owner(), {
        nameUz: 'Kichik',
        nameRu: 'Малые',
        parentId: child.id,
      }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.parentId'] } });
  });

  it('a product keeps five photos at most; sending the same one again is harmless', async () => {
    const item = await product();
    const actor = await owner();
    const ids = Array.from({ length: 5 }, (_, n) => `019a0000-0000-7000-8000-00000000000${n}`);
    for (const id of ids) {
      await stock().products.putPhoto(actor, item.id, { mediaId: id, bytes: jpeg(800, 600) });
    }
    await stock().products.putPhoto(actor, item.id, { mediaId: ids[0]!, bytes: jpeg(800, 600) });
    await expect(
      stock().products.putPhoto(actor, item.id, {
        mediaId: '019a0000-0000-7000-8000-000000000009',
        bytes: jpeg(800, 600),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    const [card] = await stock().products.list(actor);
    expect(card?.photos.map((photo) => photo.mediaId)).toEqual(ids);

    await stock().products.removePhoto(actor, item.id, ids[0]!);
    await expect(stock().products.removePhoto(actor, MISSING, ids[1]!)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('every change of a card goes to the audit log', async () => {
    const item = await product();
    await stock().products.update(await owner(), item.id, { sellPrice: 90_000 });
    await stock().products.update(await owner(), item.id, { sellPrice: 90_000 });
    const rows = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'product.update'));
    expect(rows).toHaveLength(1);
  });
});

describe('documents: a draft until it is posted (PLAN 9.6)', () => {
  it('a receipt brings goods in and sets the average cost', async () => {
    const item = await product();
    await receive(item.id, 10, 100_000);
    const second = await receive(item.id, 10, 120_000);
    expect(second.status).toBe('posted');
    expect(second.total).toBe(1_200_000);
    expect(await levelOf(item.id)).toMatchObject({ onHand: 20, reserved: 0 });
    const [card] = await stock().products.list(await owner());
    expect(card?.costs).toEqual({ avgCost: 110_000, lastCost: 120_000 });
  });

  it('a draft shows what posting will do, and changes nothing yet', async () => {
    const item = await product({
      isForSale: false,
      isConsumable: true,
      unit: 'm2',
      sellPrice: null,
    });
    await receive(item.id, 12.3, 145_000);
    const draft = await stock().documents.create(await admin(), {
      kind: 'receipt',
      ...header,
      lines: [line(item.id, 30, 145_000)],
    });
    expect(draft.lines[0]).toMatchObject({ onHandNow: 12.3, onHandAfter: 42.3 });
    expect(await levelOf(item.id)).toMatchObject({ onHand: 12.3 });
  });

  it('only a draft is edited or deleted; a posted document stays as it is', async () => {
    const item = await product();
    const actor = await admin();
    const draft = await stock().documents.create(actor, {
      kind: 'receipt',
      ...header,
      lines: [line(item.id, 1, 10)],
    });
    const edited = await stock().documents.update(actor, draft.id, {
      ...header,
      invoiceNo: '0472',
      lines: [line(item.id, 3, 10)],
    });
    expect(edited.lines[0]?.qty).toBe(3);
    await stock().documents.post(actor, draft.id);
    await expect(
      stock().documents.update(actor, draft.id, { ...header, lines: [] }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(stock().documents.remove(actor, draft.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(stock().documents.post(actor, draft.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });

    const other = await stock().documents.create(actor, {
      kind: 'receipt',
      ...header,
      lines: [line(item.id, 1, 10)],
    });
    await stock().documents.remove(actor, other.id);
    await expect(stock().documents.get(actor, other.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('two posts of one draft at once: one moves the stock, the other is refused', async () => {
    const item = await product();
    const actor = await admin();
    const draft = await stock().documents.create(actor, {
      kind: 'receipt',
      ...header,
      lines: [line(item.id, 5, 10)],
    });
    const results = await Promise.allSettled([
      stock().documents.post(actor, draft.id),
      stock().documents.post(actor, draft.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await levelOf(item.id)).toMatchObject({ onHand: 5 });
  });

  it('a receipt line needs its price; a document needs lines; a write-off its reason', async () => {
    const item = await product();
    const actor = await admin();
    await expect(
      stock().documents.create(actor, { kind: 'receipt', ...header, lines: [line(item.id, 1)] }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.lines.0.unitCost'] } });
    await expect(
      stock().documents.create(actor, {
        kind: 'write_off',
        ...header,
        supplierId: MISSING,
        lines: [],
      }),
    ).rejects.toMatchObject({ details: { paths: ['body.supplierId'] } });

    const empty = await stock().documents.create(actor, {
      kind: 'inventory',
      ...header,
      lines: [],
    });
    await expect(stock().documents.post(actor, empty.id)).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['document.lines'] },
    });
    const noReason = await stock().documents.create(actor, {
      kind: 'write_off',
      ...header,
      lines: [line(item.id, 1)],
    });
    await expect(stock().documents.post(actor, noReason.id)).rejects.toMatchObject({
      details: { paths: ['document.reason'] },
    });
  });

  it('a write-off takes only the free stock', async () => {
    const item = await product();
    await receive(item.id, 5, 10);
    await database.db
      .update(stockLevels)
      .set({ reserved: 2 })
      .where(eq(stockLevels.productId, item.id));
    const actor = await admin();
    const tooMuch = await stock().documents.create(actor, {
      kind: 'write_off',
      ...header,
      reason: 'defect',
      lines: [line(item.id, 4)],
    });
    await expect(stock().documents.post(actor, tooMuch.id)).rejects.toMatchObject({
      code: 'insufficient_stock',
    });
    expect(await levelOf(item.id)).toMatchObject({ onHand: 5, reserved: 2 });

    await stock().documents.update(actor, tooMuch.id, {
      ...header,
      reason: 'defect',
      lines: [line(item.id, 3)],
    });
    await stock().documents.post(actor, tooMuch.id);
    expect(await levelOf(item.id)).toMatchObject({ onHand: 2, reserved: 2 });
  });

  it('an inventory writes the difference and what the books said', async () => {
    const item = await product();
    await receive(item.id, 10, 10);
    const actor = await admin();
    const count = await stock().documents.create(actor, {
      kind: 'inventory',
      ...header,
      lines: [line(item.id, 8)],
    });
    const posted = await stock().documents.post(actor, count.id);
    expect(posted.lines[0]).toMatchObject({ qty: 8, expectedQty: 10, onHandNow: null });
    expect(await levelOf(item.id)).toMatchObject({ onHand: 8 });

    const page = await stock().levels.movements(actor, { productId: item.id, limit: 10 });
    expect(page.items.map((movement) => movement.delta)).toEqual([-2, 10]);
    expect(page.items[0]?.document).toMatchObject({ kind: 'inventory', number: posted.number });

    // A count that agrees writes no movement.
    const same = await stock().documents.create(actor, {
      kind: 'inventory',
      ...header,
      lines: [line(item.id, 8)],
    });
    await stock().documents.post(actor, same.id);
    expect(
      (await stock().levels.movements(actor, { productId: item.id, limit: 10 })).items,
    ).toHaveLength(2);
  });

  it('the stock is always the sum of its movements (TZ 16.4)', async () => {
    const actor = await admin();
    const items = [
      await product(),
      await product({ isForSale: false, isConsumable: true, unit: 'l', sellPrice: null }),
    ];
    // A fixed sequence of pseudo-random documents: the run is the same every time.
    let seed = 7;
    const next = () => (seed = (seed * 48_271) % 2_147_483_647);
    for (let n = 0; n < 100; n += 1) {
      const item = items[next() % items.length]!;
      const whole = item.unit === 'pcs';
      const qty = whole ? 1 + (next() % 20) : (1 + (next() % 20_000)) / 1000;
      const kind = (['receipt', 'write_off', 'inventory'] as const)[next() % 3]!;
      const draft = await stock().documents.create(actor, {
        kind,
        ...header,
        reason: kind === 'write_off' ? 'internal' : null,
        lines: [line(item.id, qty, kind === 'receipt' ? 1_000 : null)],
      });
      try {
        await stock().documents.post(actor, draft.id);
      } catch (error) {
        expect(error).toMatchObject({ code: 'insufficient_stock' });
      }
    }
    const { rows } = await database.db.execute<{
      product_id: string;
      on_hand: string;
      sum: string;
    }>(
      sql`select l.product_id, l.on_hand, coalesce(sum(m.delta), 0) as sum
          from stock_levels l left join stock_movements m on m.product_id = l.product_id
          group by l.product_id, l.on_hand`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Number(row.on_hand)).toBe(Number(row.sum));
  });
});

describe('what the database guards', () => {
  it('a movement cannot be changed or removed', async () => {
    const item = await product();
    await receive(item.id, 1, 10);
    await expect(
      database.db
        .update(stockMovements)
        .set({ delta: 5 })
        .where(eq(stockMovements.productId, item.id)),
    ).rejects.toThrow();
    await expect(
      database.db.delete(stockMovements).where(eq(stockMovements.productId, item.id)),
    ).rejects.toThrow();
  });

  it('the stock is never negative and never reserves more than there is', async () => {
    const item = await product();
    await expect(
      database.db.update(stockLevels).set({ onHand: -1 }).where(eq(stockLevels.productId, item.id)),
    ).rejects.toThrow();
    await expect(
      database.db
        .update(stockLevels)
        .set({ reserved: 1 })
        .where(eq(stockLevels.productId, item.id)),
    ).rejects.toThrow();
  });
});

describe('below the minimum', () => {
  it('lists what is at or under its minimum, and the "Bugun" block only for who may see it', async () => {
    const low = await product({ nameUz: 'Mumli shampun', minQty: 8 });
    const fine = await product({ nameUz: 'Kontaktsiz', minQty: 10 });
    await receive(low.id, 8, 10);
    await receive(fine.id, 42, 10);
    const items = await stock().levels.low(await admin());
    expect(items.map((item) => item.nameUz)).toEqual(['Mumli shampun']);
    expect(await stock().levels.lowFor(await actorWith(['master']))).toBeNull();

    const rows = await stock().levels.list(await admin(), { filter: 'low' });
    expect(rows.map((row) => row.nameUz)).toEqual(['Mumli shampun']);
    expect(rows[0]?.stock.state).toBe('low');
  });

  it('the admins and the owner hear of it once a day, in working hours', async () => {
    await setupWorkshop(t, database.db);
    const low = await product({ nameUz: 'Mumli shampun', minQty: 8 });
    await receive(low.id, 2, 10);
    const digest = t.services.tasks.find((task) => task.name === 'stock-low-digest');
    const messages = () =>
      database.db
        .select()
        .from(outbox)
        .orderBy(asc(outbox.createdAt))
        .then((rows) =>
          rows.filter(
            (row) =>
              (row.payload as { notification: { type: string } }).notification.type ===
              'staff.stock_low',
          ),
        );

    // 23:00 in Tashkent: closed.
    await digest!.run(new Date('2026-10-29T18:00:00Z'));
    expect(await messages()).toHaveLength(0);

    // Thursday 10:00: the admins and the owners, once.
    await digest!.run(new Date('2026-10-29T05:00:00Z'));
    await digest!.run(new Date('2026-10-29T06:00:00Z'));
    const sent = await messages();
    expect(sent.length).toBeGreaterThan(0);
    const recipients = new Set(sent.map((row) => row.recipientId));
    expect(recipients.size).toBe(sent.length);
    expect((sent[0]?.payload as { notification: unknown }).notification).toMatchObject({
      type: 'staff.stock_low',
      items: [{ nameUz: 'Mumli shampun', free: 2, minQty: 8, unit: 'pcs' }],
      more: 0,
    });

    // The next day, again.
    await digest!.run(new Date('2026-10-30T05:00:00Z'));
    expect((await messages()).length).toBe(sent.length * 2);
  });
});

describe('the reference data', () => {
  it('seed:reference brings the shop categories of TZ 14.3', async () => {
    await seedReference(database.db);
    const all = await stock().products.categories(await admin());
    const accessories = all.find((item) => item.nameUz === 'Aksessuarlar');
    expect(
      all.filter((item) => item.parentId === accessories?.id).map((item) => item.nameUz),
    ).toEqual(['Sochiqlar', 'Cho‘tkalar', 'Gubkalar va qo‘lqoplar']);
  });
});
