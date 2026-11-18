import type { MasterActor, StaffActor } from '../../../src/platform/actors';
import { LIMITS } from '@cs/shared/vocabulary';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  auditLog,
  bookings,
  media,
  orderItems,
  orders,
  outbox,
  statusHistory,
  taskReports,
  tasks,
} from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { html, jpeg } from '../../helpers/images';
import { createTestServices, type TestContext } from '../../helpers/services';
import { masterOf as masterOfHelper, orderInWork as orderInWorkHelper } from '../../helpers/work';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase({ maxConnections: 10 });
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const work = () => t.services.taskService;
const FRIDAY_10 = at('2026-10-30 10:00');

const masterOf = (name?: string) => masterOfHelper(database.db, name);
const orderInWork = (options: { zones?: string[]; telegram?: boolean } = {}) =>
  orderInWorkHelper(t, database.db, shop, options);

const give = (orderId: string, master: MasterActor, itemIds: string[], extra: object = {}) =>
  work().create(shop.admin, orderId, {
    masterId: master.userId,
    itemIds,
    instruction: '',
    ...extra,
  });

const photo = (
  master: MasterActor,
  taskId: string,
  kind: 'before' | 'after',
  bytes: Uint8Array = jpeg(1000, 800),
) => work().putPhoto(master, taskId, { mediaId: newId(), kind, bytes });

/** The master works and hands in the report. */
async function handIn(master: MasterActor, taskId: string, comment = 'Tayyor') {
  await work().start(master, taskId);
  await photo(master, taskId, 'before');
  await photo(master, taskId, 'after');
  return work().submit(master, taskId, comment);
}

const messages = async (type: string) =>
  (await database.db.select().from(outbox)).filter(
    (row) => (row.payload as { notification: { type: string } }).notification.type === type,
  );
const orderStatus = async (id: string) =>
  (await database.db.select().from(orders).where(eq(orders.id, id)))[0]!.status;

describe('who may do what with tasks (PLAN 8)', () => {
  it('the admin gives and checks; the director and a master from the panel may not', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const boss: StaffActor = staffActorOf(await insertStaff(database.db, ['director']), [
      'director',
    ]);
    await expect(give(order.id, master, itemIds).then(() => 'ok')).resolves.toBe('ok');
    for (const attempt of [
      () => work().masters(boss),
      () => work().list(boss, {}),
      () => work().create(boss, order.id, { masterId: master.userId, itemIds, instruction: '' }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: 'forbidden' });
    }
  });

  it('only a master holding the role can be given work', async () => {
    const { order, itemIds } = await orderInWork();
    const admin = await insertStaff(database.db, ['admin']);
    await expect(
      work().create(shop.admin, order.id, { masterId: admin.id, itemIds, instruction: '' }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.masterId'] } });
    const blocked = await insertStaff(database.db, ['master'], { isBlocked: true });
    await expect(
      work().create(shop.admin, order.id, { masterId: blocked.id, itemIds, instruction: '' }),
    ).rejects.toMatchObject({ code: 'validation' });
    const master = await masterOf();
    await expect(
      work().create(shop.admin, order.id, {
        masterId: master.userId,
        assistantId: master.userId,
        itemIds,
        instruction: '',
      }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.assistantId'] } });
    expect((await work().masters(shop.admin)).map((m) => m.id)).toEqual([master.userId]);
  });
});

describe('giving a task (PLAN 9.2)', () => {
  it('needs an order in work', async () => {
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 A 111 AA',
      color: null,
    });
    const order = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: FRIDAY_10,
    });
    await t.services.adminOrders.call(shop.admin, order.id, { outcome: 'confirmed' });
    const [item] = await database.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    await expect(give(order.id, await masterOf(), [item!.id])).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('groups zones, adds their norms, writes the status step and the audit, and tells the master', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const created = await give(order.id, master, itemIds, { instruction: 'Ehtiyotkorlik bilan' });
    expect(created).toMatchObject({
      status: 'assigned',
      master: { id: master.userId, fullName: 'Usta Bekzod' },
      assistant: null,
      instruction: 'Ehtiyotkorlik bilan',
      normMinutes: 120 + 150,
      reworkCount: 0,
      orderNumber: order.number,
      canAccept: false,
      canReassign: true,
    });
    expect(created.items).toHaveLength(2);
    const rows = await database.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));
    expect(rows.every((row) => row.taskId === created.id)).toBe(true);
    const steps = await database.db
      .select()
      .from(statusHistory)
      .where(eq(statusHistory.entityId, created.id));
    expect(steps).toMatchObject([
      { entity: 'task', fromStatus: null, toStatus: 'assigned', actorId: shop.admin.userId },
    ]);
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'task.create')),
    ).toHaveLength(1);
    const told = await messages('staff.task_assigned');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: master.userId });
    expect(told[0]?.payload).toMatchObject({
      notification: {
        taskId: created.id,
        number: order.number,
        normMinutes: 270,
        instruction: 'Ehtiyotkorlik bilan',
      },
    });
  });

  it('one zone cannot be in two tasks; a zone of another order, or a made-up one, is not given', async () => {
    const { order, itemIds } = await orderInWork();
    const other = await orderInWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf();
    await give(order.id, master, [itemIds[0]!]);
    await expect(give(order.id, master, [itemIds[0]!])).rejects.toMatchObject({
      code: 'item_unavailable',
    });
    await expect(give(order.id, master, itemIds)).rejects.toMatchObject({
      code: 'item_unavailable',
    });
    await expect(give(order.id, master, other.itemIds)).rejects.toMatchObject({
      code: 'item_unavailable',
    });
    await expect(give(order.id, master, [newId()])).rejects.toMatchObject({
      code: 'item_unavailable',
    });
    // The refused attempts changed nothing: the second zone is still free.
    await expect(give(order.id, master, [itemIds[1]!])).resolves.toMatchObject({
      status: 'assigned',
    });
  });

  it('two admins giving the same zone at once: one task, one refusal', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const a = await masterOf('Usta A');
    const b = await masterOf('Usta B');
    const results = await Promise.allSettled([
      give(order.id, a, itemIds),
      give(order.id, b, itemIds),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await database.db.select().from(tasks)).toHaveLength(1);
  });

  it('extra work that nobody answered, or that was refused, is not given', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    for (const approval of ['pending', 'rejected'] as const) {
      await database.db.update(orderItems).set({ approval }).where(eq(orderItems.id, itemIds[0]!));
      await expect(give(order.id, master, [itemIds[0]!])).rejects.toMatchObject({
        code: 'item_unavailable',
      });
    }
    await database.db
      .update(orderItems)
      .set({ approval: 'approved' })
      .where(eq(orderItems.id, itemIds[0]!));
    await expect(give(order.id, master, [itemIds[0]!])).resolves.toBeDefined();
  });
});

describe('the master’s work (PLAN 9.2)', () => {
  it('sees only their own tasks, without prices or the client’s phone; another’s is not found', async () => {
    const { order, itemIds } = await orderInWork();
    const mine = await masterOf('Mening ustam');
    const theirs = await masterOf('Boshqa usta');
    const myTask = await give(order.id, mine, [itemIds[0]!]);
    const theirTask = await give(order.id, theirs, [itemIds[1]!]);

    expect((await work().forMaster(mine, 'today')).map((task) => task.id)).toEqual([myTask.id]);
    expect((await work().forMaster(theirs, 'today')).map((task) => task.id)).toEqual([
      theirTask.id,
    ]);
    await expect(work().taskForMaster(mine, theirTask.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(work().start(mine, theirTask.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(photo(mine, theirTask.id, 'before')).rejects.toMatchObject({ code: 'not_found' });
    await expect(work().submit(mine, theirTask.id, '')).rejects.toMatchObject({
      code: 'not_found',
    });

    const seen = JSON.stringify(await work().taskForMaster(mine, myTask.id));
    expect(seen).not.toMatch(/price/i);
    expect(seen).not.toMatch(/phone/i);
    expect(seen).not.toContain(order.client.phone ?? 'no-phone');
    expect(seen).not.toContain(order.client.fullName);
    expect(JSON.stringify(await work().forMaster(mine, 'today'))).not.toMatch(/price|phone/i);
  });

  it('sees the defects the client confirmed, and how', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    const seen = await work().taskForMaster(master, task.id);
    expect(seen.actConfirmedVia).toBe('verbal');
    expect(seen.defects).toMatchObject([{ view: 'left', kind: 'scratch', note: 'Eski chiziq' }]);
  });

  it('starts once (twice is harmless); photos only while working', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await expect(photo(master, task.id, 'before')).rejects.toMatchObject({
      code: 'invalid_transition',
    });

    const started = await work().start(master, task.id);
    expect(started).toMatchObject({
      status: 'in_progress',
      canStart: false,
      canPhoto: true,
      canSubmit: false,
    });
    expect(started.startedAt).toMatchObject({ time: '10:05' });
    t.clock.set(at('2026-10-30 10:20'));
    expect((await work().start(master, task.id)).startedAt).toMatchObject({ time: '10:05' });
    expect(
      await database.db
        .select()
        .from(statusHistory)
        .where(and(eq(statusHistory.entityId, task.id), eq(statusHistory.toStatus, 'in_progress'))),
    ).toHaveLength(1);
  });

  it('the list shows the box and the seconds worked, counted by the server', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    const [waiting] = await work().forMaster(master, 'today');
    expect(waiting).toMatchObject({ boxName: '1-boks', elapsedSec: null, startedAt: null });

    await work().start(master, task.id); // 10:05
    t.clock.set(at('2026-10-30 10:47'));
    const [working] = await work().forMaster(master, 'today');
    expect(working).toMatchObject({ elapsedSec: 42 * 60, normMinutes: 270 });
    // It is a count for the one who works: nothing after the report goes in.
    await photo(master, task.id, 'after');
    await work().submit(master, task.id, '');
    const [handed] = await work().forMaster(master, 'done');
    expect(handed?.elapsedSec).toBeNull();
  });

  it('the report needs a photo of the work done; "before" photos do not count', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await work().start(master, task.id);
    await expect(work().submit(master, task.id, 'Tayyor')).rejects.toMatchObject({
      code: 'photo_required',
    });
    await photo(master, task.id, 'before');
    await expect(work().submit(master, task.id, 'Tayyor')).rejects.toMatchObject({
      code: 'photo_required',
    });
    await photo(master, task.id, 'after');
    const done = await work().submit(master, task.id, '  Hammasi joyida  ');
    expect(done).toMatchObject({ status: 'on_review', canSubmit: false, canPhoto: false });
    const [report] = await database.db.select().from(taskReports);
    expect(report).toMatchObject({
      taskId: task.id,
      attempt: 1,
      comment: 'Hammasi joyida',
      decision: null,
    });
  });

  it('handing the report in twice is harmless: one report, one message to each admin', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await handIn(master, task.id);
    await expect(work().submit(master, task.id, 'Qayta')).resolves.toMatchObject({
      status: 'on_review',
    });
    expect(await database.db.select().from(taskReports)).toHaveLength(1);
    const told = await messages('staff.report_submitted');
    expect(told.length).toBeGreaterThan(0);
    expect(new Set(told.map((row) => row.recipientId)).size).toBe(told.length);
    expect(told[0]?.payload).toMatchObject({
      notification: { taskId: task.id, masterName: 'Usta Bekzod', attempt: 1 },
    });
  });

  it('a photo sent again keeps one; the limit and the type are enforced; a photo can be removed until the report', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await work().start(master, task.id);
    const actPhotoFiles = t.files.size(); // the four sides of the act

    const mediaId = newId();
    const upload = { mediaId, kind: 'after' as const, bytes: jpeg(1000, 800) };
    const first = await work().putPhoto(master, task.id, upload);
    const second = await work().putPhoto(master, task.id, upload);
    expect(second.mediaId).toBe(first.mediaId);
    const mine = () => database.db.select().from(media).where(eq(media.taskId, task.id));
    expect(await mine()).toHaveLength(1);
    expect(t.files.size()).toBe(actPhotoFiles + 1);

    await expect(
      work().putPhoto(master, task.id, { mediaId: newId(), kind: 'after', bytes: html }),
    ).rejects.toMatchObject({ code: 'invalid_photo' });
    // Another meaning for the same id is refused.
    await expect(
      work().putPhoto(master, task.id, { mediaId, kind: 'before', bytes: jpeg(1000, 800) }),
    ).rejects.toMatchObject({ code: 'validation' });

    await work().deletePhoto(master, task.id, mediaId);
    expect(await mine()).toHaveLength(0);
    expect(t.files.size()).toBe(actPhotoFiles);
    await expect(work().deletePhoto(master, task.id, mediaId)).resolves.toBeUndefined();

    for (let i = 0; i < LIMITS.taskPhotos.max; i += 1) await photo(master, task.id, 'before');
    await expect(photo(master, task.id, 'before')).rejects.toMatchObject({ code: 'validation' });
  });

  it('after the report goes in, photos can neither be added nor removed', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await work().start(master, task.id);
    const kept = await photo(master, task.id, 'after');
    await work().submit(master, task.id, '');
    await expect(photo(master, task.id, 'after')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(work().deletePhoto(master, task.id, kept.mediaId)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    // The phone repeating an upload that did arrive still gets its answer.
    await expect(
      work().putPhoto(master, task.id, {
        mediaId: kept.mediaId,
        kind: 'after',
        bytes: jpeg(1000, 800),
      }),
    ).resolves.toMatchObject({ mediaId: kept.mediaId });
  });
});

describe('checking the report (PLAN 9.2)', () => {
  it('the admin sees both attempts with their photos, comments and decisions', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await handIn(master, task.id, 'Birinchi urinish');
    await work().rework(shop.admin, task.id, 'Chang qolgan');
    await photo(master, task.id, 'after');
    await work().submit(master, task.id, 'Tuzatdim');

    const seen = await work().get(shop.admin, task.id);
    expect(seen).toMatchObject({
      status: 'on_review',
      reworkCount: 1,
      lastRemark: 'Chang qolgan',
      canAccept: true,
      canRework: true,
    });
    expect(seen.attempts).toHaveLength(2);
    expect(seen.attempts[0]).toMatchObject({
      attempt: 1,
      comment: 'Birinchi urinish',
      decision: 'rework',
      remark: 'Chang qolgan',
    });
    expect(seen.attempts[0]?.photos.map((p) => p.kind).sort()).toEqual(['after', 'before']);
    expect(seen.attempts[1]).toMatchObject({ attempt: 2, comment: 'Tuzatdim', decision: null });
    expect(seen.attempts[1]?.photos.map((p) => p.kind)).toEqual(['after']);
    expect((await work().list(shop.admin, { tab: 'review' })).map((x) => x.id)).toEqual([task.id]);
    expect(await work().list(shop.admin, { tab: 'active' })).toEqual([]);
  });

  it('sending back needs a remark; the master is told and starts a new attempt', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await handIn(master, task.id);

    await expect(work().rework(shop.admin, task.id, '   ')).rejects.toMatchObject({
      code: 'validation',
    });
    expect((await work().get(shop.admin, task.id)).status).toBe('on_review');

    const back = await work().rework(shop.admin, task.id, '  Chang qolgan  ');
    expect(back).toMatchObject({ status: 'rework', reworkCount: 1, lastRemark: 'Chang qolgan' });
    const told = await messages('staff.task_rework');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: master.userId });
    expect(told[0]?.payload).toMatchObject({ notification: { remark: 'Chang qolgan' } });

    const seen = await work().taskForMaster(master, task.id);
    expect(seen).toMatchObject({
      status: 'rework',
      attempt: 2,
      lastRemark: 'Chang qolgan',
      photos: [],
      canPhoto: true,
      canSubmit: false,
    });
    expect((await work().forMaster(master, 'rework')).map((x) => x.id)).toEqual([task.id]);
    // The new attempt needs its own photo of the work done.
    await expect(work().submit(master, task.id, 'Tayyor')).rejects.toMatchObject({
      code: 'photo_required',
    });
    await photo(master, task.id, 'after');
    await expect(work().submit(master, task.id, 'Tayyor')).resolves.toMatchObject({
      status: 'on_review',
      attempt: 2,
    });
    expect(
      (await database.db.select().from(taskReports).orderBy(asc(taskReports.attempt))).map(
        (r) => r.attempt,
      ),
    ).toEqual([1, 2]);
  });

  it('only a task on review can be accepted or sent back, and only once', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await expect(work().accept(shop.admin, task.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(work().rework(shop.admin, task.id, 'x')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await handIn(master, task.id);
    await work().accept(shop.admin, task.id);
    await expect(work().accept(shop.admin, task.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(work().rework(shop.admin, task.id, 'x')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });
});

describe('giving a task to another master (PLAN 9.2)', () => {
  it('only while it is assigned or in progress; it starts over for the new master, who is told', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const first = await masterOf('Birinchi');
    const second = await masterOf('Ikkinchi');
    const task = await give(order.id, first, itemIds);
    await work().start(first, task.id);

    const moved = await work().update(shop.admin, task.id, { masterId: second.userId });
    expect(moved).toMatchObject({
      status: 'assigned',
      master: { id: second.userId },
      startedAt: null,
    });
    expect(await work().forMaster(first, 'today')).toEqual([]);
    await expect(work().taskForMaster(first, task.id)).rejects.toMatchObject({ code: 'not_found' });
    expect((await work().forMaster(second, 'today')).map((x) => x.id)).toEqual([task.id]);
    expect((await messages('staff.task_assigned')).map((row) => row.recipientId)).toEqual([
      first.userId,
      second.userId,
    ]);
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'task.reassign')),
    ).toHaveLength(1);

    await handIn(second, task.id);
    await expect(
      work().update(shop.admin, task.id, { masterId: first.userId }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    await work().rework(shop.admin, task.id, 'Qayta');
    await expect(
      work().update(shop.admin, task.id, { masterId: first.userId }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    // The instruction can still change while it is being redone.
    await expect(
      work().update(shop.admin, task.id, { instruction: 'Yangi ko‘rsatma' }),
    ).resolves.toMatchObject({ instruction: 'Yangi ko‘rsatma' });
  });

  it('after it was accepted nothing changes', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf();
    const task = await give(order.id, master, itemIds);
    await handIn(master, task.id);
    await work().accept(shop.admin, task.id);
    await expect(work().update(shop.admin, task.id, { instruction: 'x' })).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await expect(
      work().update(shop.admin, task.id, { masterId: (await masterOf()).userId }),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
  });
});

describe('the order is ready when the work is (PLAN 9.1)', () => {
  it('the last accepted task makes it ready for pickup, in the same step, and tells the client', async () => {
    const { client, order, itemIds } = await orderInWork();
    const master = await masterOf();
    const first = await give(order.id, master, [itemIds[0]!]);
    const second = await give(order.id, master, [itemIds[1]!]);
    await handIn(master, first.id);
    await handIn(master, second.id);

    await work().accept(shop.admin, first.id);
    expect(await orderStatus(order.id)).toBe('in_work');
    expect(await messages('order.ready')).toHaveLength(0);

    t.clock.set(at('2026-10-30 11:30'));
    await work().accept(shop.admin, second.id);
    expect(await orderStatus(order.id)).toBe('ready_for_pickup');
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.readyAt).toEqual(t.clock.now());
    const steps = await database.db
      .select()
      .from(statusHistory)
      .where(
        and(eq(statusHistory.entityId, order.id), eq(statusHistory.toStatus, 'ready_for_pickup')),
      );
    expect(steps).toMatchObject([{ fromStatus: 'in_work', actorId: null }]);
    const told = await messages('order.ready');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: client.userId });
    expect(told[0]?.payload).toMatchObject({
      notification: { number: order.number, total: row?.total, closesAt: '20:00' },
    });
  });

  it('not while a zone has no task, or an extra waits for the client’s answer', async () => {
    const { order, itemIds } = await orderInWork();
    const master = await masterOf();
    const only = await give(order.id, master, [itemIds[0]!]);
    await handIn(master, only.id);
    await work().accept(shop.admin, only.id);
    expect(await orderStatus(order.id)).toBe('in_work'); // the second zone has no task

    const rest = await give(order.id, master, [itemIds[1]!]);
    await handIn(master, rest.id);
    await database.db.insert(orderItems).values({
      orderId: order.id,
      serviceId: shop.zones.other,
      serviceTypeId: shop.ceramicId,
      nameUz: 'Qo‘shimcha',
      nameRu: 'Доп',
      typeNameUz: 'Keramika',
      typeNameRu: 'Керамика',
      bodyClass: 'M',
      price: 100_000,
      durationMin: 30,
      kind: 'extra',
      approval: 'pending',
    });
    await work().accept(shop.admin, rest.id);
    expect(await orderStatus(order.id)).toBe('in_work'); // the client has not answered
    expect(await messages('order.ready')).toHaveLength(0);
  });

  it('a refused extra does not hold the order back, an approved one must be done first', async () => {
    const { order, itemIds } = await orderInWork({ zones: [shop.zones.bonnet] });
    const master = await masterOf();
    const main = await give(order.id, master, itemIds);
    await handIn(master, main.id);
    const [extra] = await database.db
      .insert(orderItems)
      .values({
        orderId: order.id,
        serviceId: shop.zones.other,
        serviceTypeId: shop.ceramicId,
        nameUz: 'Qo‘shimcha',
        nameRu: 'Доп',
        typeNameUz: 'Keramika',
        typeNameRu: 'Керамика',
        bodyClass: 'M',
        price: 100_000,
        durationMin: 30,
        kind: 'extra',
        approval: 'approved',
      })
      .returning();
    await work().accept(shop.admin, main.id);
    expect(await orderStatus(order.id)).toBe('in_work'); // the approved extra is not done yet

    await database.db
      .update(orderItems)
      .set({ approval: 'rejected' })
      .where(eq(orderItems.id, extra!.id));
    await t.services.adminOrders.onTasksChanged(database.db as never, order.id);
    expect(await orderStatus(order.id)).toBe('ready_for_pickup');
  });

  it('the booking is given back whole when the work has not begun in it, and cut short when it has', async () => {
    // Work done before the booked time began: the box is free again at once.
    const early = await orderInWork({ zones: [shop.zones.bonnet] });
    t.clock.set(at('2026-10-30 09:00'));
    const master = await masterOf();
    const task = await give(early.order.id, master, early.itemIds);
    await handIn(master, task.id);
    await work().accept(shop.admin, task.id);
    const given = await database.db
      .select()
      .from(bookings)
      .where(eq(bookings.orderId, early.order.id));
    expect(given[0]?.releasedAt).not.toBeNull();
    expect(given[0]?.releaseReason).toBe('work_done');

    // Work done in the middle of the booking: it ends now.
    const mid = await orderInWork({ zones: [shop.zones.bonnet, shop.zones.bumper] });
    const worker = await masterOf('Usta 2');
    const job = await give(mid.order.id, worker, mid.itemIds);
    await handIn(worker, job.id);
    t.clock.set(at('2026-10-30 11:00'));
    await work().accept(shop.admin, job.id);
    const [cut] = await database.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.orderId, mid.order.id), isNull(bookings.releasedAt)));
    expect(cut?.endsAt).toEqual(at('2026-10-30 11:00'));
  });

  it('the freed time can be booked by another client', async () => {
    // Two long jobs hold both boxes until the afternoon.
    const long = [shop.zones.bonnet, shop.zones.bumper];
    const a = await orderInWork({ zones: long });
    await orderInWork({ zones: long });
    const master = await masterOf();
    const task = await give(a.order.id, master, a.itemIds);
    await handIn(master, task.id);

    const client = await makeClient(database.db, { name: 'Keyingi mijoz' });
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2021,
      plate: '01 B 222 BB',
      color: null,
    });
    const query = { carId: car.id, serviceIds: [shop.zones.bonnet], date: '2026-10-30' };
    // The clients' lead time is two hours, so 12:30 is the first start they may take at 10:30.
    const firstSlot = async () =>
      (await t.services.orders.slots(client, query)).slots.find(
        (slot) => slot.startsAt.time === '12:30',
      );
    t.clock.set(at('2026-10-30 10:30'));
    expect(await firstSlot()).toMatchObject({ free: false });

    await work().accept(shop.admin, task.id);
    expect(await firstSlot()).toMatchObject({ free: true, boxName: '1-boks' });
  });
});
