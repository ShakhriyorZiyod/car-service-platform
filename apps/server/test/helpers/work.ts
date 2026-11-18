import type { Db } from '../../src/db/client';
import type { MasterActor } from '../../src/platform/actors';
import { newId } from '../../src/lib/ids';
import { insertStaff, uniqueTelegramId } from './factories';
import { jpeg } from './images';
import type { TestContext } from './services';
import { at, makeClient, type Workshop } from './workshop-setup';

/** A master, as the Mini App establishes one. */
export async function masterOf(db: Db, name = 'Usta Bekzod'): Promise<MasterActor> {
  const user = await insertStaff(db, ['master'], {
    fullName: name,
    telegramId: uniqueTelegramId(),
  });
  return {
    kind: 'master',
    userId: user.id,
    telegramId: user.telegramId ?? 0,
    lang: 'uz',
    fullName: name,
  };
}

/**
 * An order in work: the client booked, the admin confirmed, the car arrived, the act was written
 * and confirmed, and the work began. The clock ends at Friday 10:05.
 */
export async function orderInWork(
  t: TestContext,
  db: Db,
  shop: Workshop,
  options: { zones?: string[]; telegram?: boolean } = {},
) {
  t.clock.set(at('2026-10-29 10:00')); // the day before: Friday 10:00 is still ahead
  const client = await makeClient(db, options);
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
    serviceIds: options.zones ?? [shop.zones.bonnet, shop.zones.bumper],
    startsAt: at('2026-10-30 10:00'),
  });
  await t.services.adminOrders.call(shop.admin, order.id, { outcome: 'confirmed' });
  t.clock.set(at('2026-10-30 10:05'));
  await t.services.reception.save(shop.admin, order.id, {
    mileageKm: 10_000,
    fuelLevel: 2,
    checklist: {},
    personalItems: null,
    defects: [
      { view: 'left', x: 0.5, y: 0.5, kind: 'scratch', note: 'Eski chiziq', mediaId: null },
    ],
  });
  for (const side of ['front', 'back', 'left', 'right'] as const) {
    await t.services.reception.putPhoto(shop.admin, order.id, {
      mediaId: newId(),
      purpose: 'side',
      side,
      bytes: jpeg(800, 600),
    });
  }
  await t.services.reception.confirmVerbal(shop.admin, order.id);
  const started = await t.services.reception.startWork(shop.admin, order.id);
  return { client, order: started, itemIds: started.items.map((item) => item.id) };
}
