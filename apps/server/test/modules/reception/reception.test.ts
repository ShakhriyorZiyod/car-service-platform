import { LIMITS } from '@cs/shared/vocabulary';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  auditLog,
  media,
  orders,
  outbox,
  receptionActs,
  receptionDefects,
  statusHistory,
} from '../../../src/db/schema';
import { newId } from '../../../src/lib/ids';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { gif, html, jpeg, png, svg, webpLossy } from '../../helpers/images';
import { createTestServices, type TestContext } from '../../helpers/services';
import { at, makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const reception = () => t.services.reception;
const FRIDAY_10 = at('2026-10-30 10:00');
const SIDES = ['front', 'back', 'left', 'right'] as const;

async function confirmedOrder(options: { telegram?: boolean } = {}) {
  const client = await makeClient(database.db, options);
  const car = await t.services.garage.create(client, {
    modelId: shop.models.tracker,
    customModelText: null,
    bodyClass: null,
    year: 2022,
    plate: `01${Math.floor(Math.random() * 900 + 100)}ABC`,
    color: null,
  });
  const order = await t.services.orders.create(client, {
    requestId: newId(),
    carId: car.id,
    serviceIds: [shop.zones.bonnet],
    startsAt: FRIDAY_10,
  });
  await t.services.adminOrders.call(shop.admin, order.id, { outcome: 'confirmed' });
  return { client, order };
}

const side = (orderId: string, name: (typeof SIDES)[number], bytes: Uint8Array = jpeg(1200, 900)) =>
  reception().putPhoto(shop.admin, orderId, {
    mediaId: newId(),
    purpose: 'side',
    side: name,
    bytes,
  });

const draft = (overrides: Record<string, unknown> = {}) => ({
  mileageKm: 45_200,
  fuelLevel: 3,
  checklist: { spareWheel: true, jack: true },
  personalItems: null,
  defects: [],
  ...overrides,
});

/** An act that can be sent: mileage, fuel and the four sides. */
async function completeAct(orderId: string) {
  await reception().save(shop.admin, orderId, draft());
  for (const name of SIDES) await side(orderId, name);
}

const messages = async (type: string) =>
  (await database.db.select().from(outbox)).filter(
    (row) => (row.payload as { notification: { type: string } }).notification.type === type,
  );

describe('who may do what with the act (PLAN 8)', () => {
  it('the admin writes; the director only reads; a master sees nothing', async () => {
    const { order } = await confirmedOrder();
    const boss = staffActorOf(await insertStaff(database.db, ['director']), ['director']);
    expect(await reception().get(boss, order.id)).toMatchObject({ act: null, canEdit: false });
    for (const attempt of [
      () => reception().save(boss, order.id, draft()),
      () => reception().send(boss, order.id),
      () => reception().confirmVerbal(boss, order.id),
      () => reception().startWork(boss, order.id),
      () =>
        reception().putPhoto(boss, order.id, {
          mediaId: newId(),
          purpose: 'side',
          side: 'front',
          bytes: jpeg(10, 10),
        }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: 'forbidden' });
    }
    const master = staffActorOf(await insertStaff(database.db, ['master']), ['master']);
    await expect(reception().get(master, order.id)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('an order that does not exist is not found', async () => {
    await expect(reception().get(shop.admin, newId())).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('filling in the act', () => {
  it('only for a confirmed order: not before the call, not after the work starts', async () => {
    const client = await makeClient(database.db);
    const car = await t.services.garage.create(client, {
      modelId: shop.models.tracker,
      customModelText: null,
      bodyClass: null,
      year: 2022,
      plate: '01 A 123 BC',
      color: null,
    });
    const fresh = await t.services.orders.create(client, {
      requestId: newId(),
      carId: car.id,
      serviceIds: [shop.zones.bonnet],
      startsAt: FRIDAY_10,
    });
    await expect(reception().save(shop.admin, fresh.id, draft())).rejects.toMatchObject({
      code: 'invalid_transition',
    });

    const { order } = await confirmedOrder();
    await database.db.update(orders).set({ status: 'in_work' }).where(eq(orders.id, order.id));
    await expect(reception().save(shop.admin, order.id, draft())).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('keeps the draft: mileage, fuel, the checklist and the defects in order', async () => {
    const { order } = await confirmedOrder();
    const saved = await reception().save(
      shop.admin,
      order.id,
      draft({
        personalItems: 'Planshet, zaryadka',
        defects: [
          {
            view: 'left',
            x: 0.25,
            y: 0.5,
            kind: 'scratch',
            note: 'Chap eshikda chiziq',
            mediaId: null,
          },
          { view: 'top', x: 0.5, y: 0.1, kind: 'dent', note: null, mediaId: null },
        ],
      }),
    );
    expect(saved.act).toMatchObject({
      status: 'draft',
      mileageKm: 45_200,
      fuelLevel: 3,
      checklist: { spareWheel: true, jack: true },
      personalItems: 'Planshet, zaryadka',
      defects: [
        { view: 'left', x: 0.25, y: 0.5, kind: 'scratch', note: 'Chap eshikda chiziq' },
        { view: 'top', x: 0.5, y: 0.1, kind: 'dent', note: null },
      ],
      missing: ['front', 'back', 'left', 'right'],
    });
    expect(saved).toMatchObject({ canEdit: true, canSend: false });
  });

  it('the defects are the whole list: saving again replaces them', async () => {
    const { order } = await confirmedOrder();
    await reception().save(
      shop.admin,
      order.id,
      draft({
        defects: [{ view: 'front', x: 0.1, y: 0.1, kind: 'chip', note: null, mediaId: null }],
      }),
    );
    const again = await reception().save(shop.admin, order.id, draft({ defects: [] }));
    expect(again.act?.defects).toEqual([]);
    expect(await database.db.select().from(receptionDefects)).toHaveLength(0);
  });

  it('a defect’s photo must be one uploaded for this act, and used once', async () => {
    const { order } = await confirmedOrder();
    const other = await confirmedOrder();
    const mine = newId();
    await reception().putPhoto(shop.admin, order.id, {
      mediaId: mine,
      purpose: 'defect',
      bytes: jpeg(800, 600),
    });
    const theirs = newId();
    await reception().putPhoto(shop.admin, other.order.id, {
      mediaId: theirs,
      purpose: 'defect',
      bytes: jpeg(800, 600),
    });

    const defect = (mediaId: string | null) => ({
      view: 'left',
      x: 0.5,
      y: 0.5,
      kind: 'dent',
      note: null,
      mediaId,
    });
    await expect(
      reception().save(shop.admin, order.id, draft({ defects: [defect(theirs)] })),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.defects.0.mediaId'] },
    });
    await expect(
      reception().save(shop.admin, order.id, draft({ defects: [defect(newId())] })),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      reception().save(shop.admin, order.id, draft({ defects: [defect(mine), defect(mine)] })),
    ).rejects.toMatchObject({ code: 'validation' });

    const ok = await reception().save(shop.admin, order.id, draft({ defects: [defect(mine)] }));
    expect(ok.act?.defects[0]?.photo).toMatchObject({ mediaId: mine });
  });

  it('a defect taken off the list takes its photo with it, row and file', async () => {
    const { order } = await confirmedOrder();
    const photoId = newId();
    await reception().putPhoto(shop.admin, order.id, {
      mediaId: photoId,
      purpose: 'defect',
      bytes: jpeg(800, 600),
    });
    await reception().save(
      shop.admin,
      order.id,
      draft({
        defects: [{ view: 'left', x: 0.5, y: 0.5, kind: 'dent', note: null, mediaId: photoId }],
      }),
    );
    expect(t.files.size()).toBe(1);

    await reception().save(shop.admin, order.id, draft({ defects: [] }));
    expect(await database.db.select().from(media)).toHaveLength(0);
    expect(t.files.size()).toBe(0);
  });
});

describe('the photos (PLAN 4.9)', () => {
  it('JPEG, PNG and WebP are kept, with their size read from the bytes', async () => {
    const { order } = await confirmedOrder();
    await side(order.id, 'front', jpeg(1600, 1200));
    await side(order.id, 'back', png(800, 600));
    await side(order.id, 'left', webpLossy(1024, 768));
    const rows = await database.db.select().from(media);
    expect(rows.map((row) => [row.mime, row.width, row.height]).sort()).toEqual([
      ['image/jpeg', 1600, 1200],
      ['image/png', 800, 600],
      ['image/webp', 1024, 768],
    ]);
  });

  it.each([
    ['an SVG', svg],
    ['an HTML page', html],
    ['a GIF', gif],
    ['plain text', Buffer.from('hello')],
    ['nothing', Buffer.alloc(0)],
  ])('%s is refused and nothing is kept', async (_name, bytes) => {
    const { order } = await confirmedOrder();
    await expect(side(order.id, 'front', bytes)).rejects.toMatchObject({ code: 'invalid_photo' });
    expect(await database.db.select().from(media)).toHaveLength(0);
    expect(t.files.size()).toBe(0);
  });

  it('a photo over the limit is refused, one at the limit is kept', async () => {
    const { order } = await confirmedOrder();
    const pad = (size: number) =>
      Buffer.concat([jpeg(800, 600), Buffer.alloc(size - jpeg(800, 600).length)]);
    await expect(side(order.id, 'front', pad(LIMITS.photoBytes.max + 1))).rejects.toMatchObject({
      code: 'invalid_photo',
    });
    await expect(side(order.id, 'front', pad(LIMITS.photoBytes.max))).resolves.toBeDefined();
  });

  it('sending the same photo again keeps one photo and one file', async () => {
    const { order } = await confirmedOrder();
    const mediaId = newId();
    const upload = {
      mediaId,
      purpose: 'side' as const,
      side: 'front' as const,
      bytes: jpeg(1000, 800),
    };
    const first = await reception().putPhoto(shop.admin, order.id, upload);
    const second = await reception().putPhoto(shop.admin, order.id, upload);
    expect(second.mediaId).toBe(first.mediaId);
    expect(await database.db.select().from(media)).toHaveLength(1);
    expect(t.files.size()).toBe(1);
  });

  it('the same id for another meaning is refused', async () => {
    const { order } = await confirmedOrder();
    const mediaId = newId();
    await reception().putPhoto(shop.admin, order.id, {
      mediaId,
      purpose: 'side',
      side: 'front',
      bytes: jpeg(1000, 800),
    });
    await expect(
      reception().putPhoto(shop.admin, order.id, {
        mediaId,
        purpose: 'side',
        side: 'back',
        bytes: jpeg(1000, 800),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      reception().putPhoto(shop.admin, order.id, {
        mediaId,
        purpose: 'defect',
        bytes: jpeg(1000, 800),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    // And another order's act cannot take a photo that is already used elsewhere.
    const other = await confirmedOrder();
    await expect(
      reception().putPhoto(shop.admin, other.order.id, {
        mediaId,
        purpose: 'side',
        side: 'front',
        bytes: jpeg(1000, 800),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('a new photo of a side takes the old one’s place, file included', async () => {
    const { order } = await confirmedOrder();
    const first = await side(order.id, 'front', jpeg(800, 600));
    const second = await side(order.id, 'front', png(1000, 700));
    const rows = await database.db.select().from(media);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(second.mediaId);
    expect(rows[0]?.id).not.toBe(first.mediaId);
    expect(t.files.size()).toBe(1);
  });

  it('a side photo names its side, a defect photo does not', async () => {
    const { order } = await confirmedOrder();
    await expect(
      reception().putPhoto(shop.admin, order.id, {
        mediaId: newId(),
        purpose: 'side',
        bytes: jpeg(10, 10),
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('is opened through its signed link only, and only for fifteen minutes', async () => {
    const { order } = await confirmedOrder();
    const photo = await side(order.id, 'front', jpeg(1000, 800));
    const url = new URL(photo.url, 'https://example.uz');
    const [, , id] = url.pathname.split('/');
    const exp = Number(url.searchParams.get('exp'));
    const sig = url.searchParams.get('sig') ?? '';

    const opened = await t.services.media.open(id!, exp, sig);
    expect(opened?.mime).toBe('image/jpeg');
    expect(opened?.bytes.length).toBeGreaterThan(0);
    expect(await t.services.media.open(id!, exp, `${sig.slice(0, -2)}xx`)).toBeNull();
    expect(await t.services.media.open(newId(), exp, sig)).toBeNull();
    t.clock.set(new Date(exp * 1000));
    expect(await t.services.media.open(id!, exp, sig)).toBeNull();
  });
});

describe('sending the act to the client (PLAN 9.4)', () => {
  it('lists what is missing and keeps the act a draft', async () => {
    const { order } = await confirmedOrder();
    await reception().save(shop.admin, order.id, draft({ mileageKm: null, fuelLevel: null }));
    await side(order.id, 'front');
    await expect(reception().send(shop.admin, order.id)).rejects.toMatchObject({
      code: 'act_incomplete',
      details: { paths: ['act.mileage', 'act.fuel', 'act.back', 'act.left', 'act.right'] },
    });
    expect((await reception().get(shop.admin, order.id)).act?.status).toBe('draft');
    expect(await messages('act.confirm_request')).toHaveLength(0);
  });

  it('there must be an act to send', async () => {
    const { order } = await confirmedOrder();
    await expect(reception().send(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('a complete act is sent: status, time, audit, and one message to the client with the counts', async () => {
    const { client, order } = await confirmedOrder();
    const defectPhoto = newId();
    await reception().putPhoto(shop.admin, order.id, {
      mediaId: defectPhoto,
      purpose: 'defect',
      bytes: jpeg(800, 600),
    });
    await reception().save(
      shop.admin,
      order.id,
      draft({
        defects: [{ view: 'left', x: 0.5, y: 0.5, kind: 'dent', note: null, mediaId: defectPhoto }],
      }),
    );
    for (const name of SIDES) await side(order.id, name);

    const sent = await reception().send(shop.admin, order.id);
    expect(sent.act).toMatchObject({ status: 'sent', missing: [], sentAt: { time: '10:00' } });
    expect(sent).toMatchObject({
      canEdit: true,
      canSend: false,
      canConfirmVerbal: true,
      canStartWork: false,
    });

    const told = await messages('act.confirm_request');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({ recipientId: client.userId });
    expect(told[0]?.payload).toMatchObject({
      notification: {
        orderId: order.id,
        number: order.number,
        car: expect.stringContaining('Tracker') as string,
        mileageKm: 45_200,
        fuelLevel: 3,
        defects: 1,
        photos: 5,
      },
    });
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'act.send')),
    ).toHaveLength(1);
    // Sent twice is not possible, so not messaged twice.
    await expect(reception().send(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    expect(await messages('act.confirm_request')).toHaveLength(1);
  });

  it('a client without Telegram is not written to, and nothing fails', async () => {
    const { order } = await confirmedOrder({ telegram: false });
    await completeAct(order.id);
    await expect(reception().send(shop.admin, order.id)).resolves.toMatchObject({
      act: { status: 'sent' },
    });
    expect(await messages('act.confirm_request')).toHaveLength(0);
  });

  it('changing a sent act takes it back to a draft, and the client can no longer confirm it', async () => {
    const { client, order } = await confirmedOrder();
    await completeAct(order.id);
    await reception().send(shop.admin, order.id);
    expect((await reception().forClient(client, order.id)).canConfirm).toBe(true);

    const reopened = await reception().save(shop.admin, order.id, draft({ mileageKm: 45_300 }));
    expect(reopened.act).toMatchObject({ status: 'draft', sentAt: null, mileageKm: 45_300 });
    expect(await reception().forClient(client, order.id)).toEqual({ act: null, canConfirm: false });
    await expect(reception().confirmByClient(client, order.id, 'bot')).rejects.toMatchObject({
      code: 'invalid_transition',
    });

    // A new photo does the same.
    await reception().send(shop.admin, order.id);
    await side(order.id, 'front');
    expect((await reception().get(shop.admin, order.id)).act?.status).toBe('draft');
  });
});

describe('the client’s confirmation', () => {
  it('sees the act only once it was sent, with photos as signed links', async () => {
    const { client, order } = await confirmedOrder();
    expect(await reception().forClient(client, order.id)).toEqual({ act: null, canConfirm: false });
    await completeAct(order.id);
    expect(await reception().forClient(client, order.id)).toEqual({ act: null, canConfirm: false });
    await reception().send(shop.admin, order.id);

    const view = await reception().forClient(client, order.id);
    expect(view.canConfirm).toBe(true);
    expect(view.act?.sides.map((s) => s.side)).toEqual(['front', 'back', 'left', 'right']);
    expect(view.act?.sides[0]?.url).toMatch(/^\/media\/[0-9a-f-]{36}\?exp=\d+&sig=\S+$/);
  });

  it('confirms in the bot or in the app; the act is signed, and repeating it is harmless', async () => {
    const { client, order } = await confirmedOrder();
    await completeAct(order.id);
    await reception().send(shop.admin, order.id);

    const done = await reception().confirmByClient(client, order.id, 'bot');
    expect(done).toMatchObject({
      canConfirm: false,
      act: { status: 'confirmed', confirmedVia: 'bot', confirmedAt: { time: '10:00' } },
    });
    const again = await reception().confirmByClient(client, order.id, 'tma');
    expect(again.act).toMatchObject({ status: 'confirmed', confirmedVia: 'bot' });
    const [row] = await database.db.select().from(receptionActs);
    expect(row).toMatchObject({ status: 'confirmed', confirmedVia: 'bot', confirmedBy: null });
  });

  it('a draft cannot be confirmed, and somebody else’s order does not exist', async () => {
    const { client, order } = await confirmedOrder();
    await completeAct(order.id);
    await expect(reception().confirmByClient(client, order.id, 'tma')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await reception().send(shop.admin, order.id);

    const stranger = await makeClient(database.db, { name: 'Boshqa Odam' });
    await expect(reception().confirmByClient(stranger, order.id, 'tma')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(reception().forClient(stranger, order.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect((await database.db.select().from(receptionActs))[0]?.status).toBe('sent');
  });

  it('an order that was cancelled in the meantime cannot be confirmed', async () => {
    const { client, order } = await confirmedOrder();
    await completeAct(order.id);
    await reception().send(shop.admin, order.id);
    await t.services.orders.cancel(client, order.id, {
      reasonId: (await t.services.adminOrders.cancelReasons(shop.admin))[0]!.id,
    });
    await expect(reception().confirmByClient(client, order.id, 'tma')).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('a confirmed act can no longer be changed', async () => {
    const { client, order } = await confirmedOrder();
    await completeAct(order.id);
    await reception().send(shop.admin, order.id);
    await reception().confirmByClient(client, order.id, 'tma');
    await expect(
      reception().save(shop.admin, order.id, draft({ mileageKm: 1 })),
    ).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(side(order.id, 'front')).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(reception().send(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });
});

describe('a verbal confirmation', () => {
  it('is written down by the admin, straight from a draft, with their name', async () => {
    const { order } = await confirmedOrder();
    await completeAct(order.id);
    const done = await reception().confirmVerbal(shop.admin, order.id);
    expect(done.act).toMatchObject({ status: 'confirmed', confirmedVia: 'verbal' });
    expect(done.canStartWork).toBe(true);
    const [row] = await database.db.select().from(receptionActs);
    expect(row).toMatchObject({ confirmedBy: shop.admin.userId, status: 'confirmed' });
    expect(row?.sentAt).not.toBeNull();
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'act.confirm_verbal')),
    ).toHaveLength(1);
  });

  it('works after it was sent, too, but only for a complete act', async () => {
    const { order } = await confirmedOrder();
    await reception().save(shop.admin, order.id, draft());
    await expect(reception().confirmVerbal(shop.admin, order.id)).rejects.toMatchObject({
      code: 'act_incomplete',
    });
    for (const name of SIDES) await side(order.id, name);
    await reception().send(shop.admin, order.id);
    await expect(reception().confirmVerbal(shop.admin, order.id)).resolves.toMatchObject({
      act: { status: 'confirmed' },
    });
  });

  it('there must be an act, and it can be written down only once', async () => {
    const { order } = await confirmedOrder();
    await expect(reception().confirmVerbal(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
    await completeAct(order.id);
    await reception().confirmVerbal(shop.admin, order.id);
    await expect(reception().confirmVerbal(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });
});

describe('handing the order to work (PLAN 9.1, stage 5)', () => {
  it('without a confirmed act there is no work', async () => {
    const { order } = await confirmedOrder();
    await expect(reception().startWork(shop.admin, order.id)).rejects.toMatchObject({
      code: 'act_not_confirmed',
    });
    await completeAct(order.id);
    await expect(reception().startWork(shop.admin, order.id)).rejects.toMatchObject({
      code: 'act_not_confirmed',
    });
    await reception().send(shop.admin, order.id);
    await expect(reception().startWork(shop.admin, order.id)).rejects.toMatchObject({
      code: 'act_not_confirmed',
    });
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.status).toBe('confirmed');
  });

  it('with the client’s word the order goes to work: status, time, history, audit', async () => {
    const { client, order } = await confirmedOrder();
    t.clock.set(at('2026-10-30 10:05')); // the car has arrived
    await completeAct(order.id);
    await reception().send(shop.admin, order.id);
    await reception().confirmByClient(client, order.id, 'bot');

    const started = await reception().startWork(shop.admin, order.id);
    expect(started).toMatchObject({ id: order.id, status: 'in_work' });
    const [row] = await database.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.workStartedAt).toEqual(t.clock.now());
    const steps = await database.db
      .select()
      .from(statusHistory)
      .where(and(eq(statusHistory.entityId, order.id), eq(statusHistory.toStatus, 'in_work')));
    expect(steps).toMatchObject([{ fromStatus: 'confirmed', actorId: shop.admin.userId }]);
    expect(
      await database.db.select().from(auditLog).where(eq(auditLog.action, 'order.start_work')),
    ).toHaveLength(1);
    // The box stays held while the work goes on.
    await expect(reception().startWork(shop.admin, order.id)).rejects.toMatchObject({
      code: 'invalid_transition',
    });
  });

  it('through a verbal confirmation too', async () => {
    const { order } = await confirmedOrder();
    await completeAct(order.id);
    await reception().confirmVerbal(shop.admin, order.id);
    await expect(reception().startWork(shop.admin, order.id)).resolves.toMatchObject({
      status: 'in_work',
    });
  });
});
