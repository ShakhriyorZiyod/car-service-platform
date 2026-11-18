// Stage 5 browser fixture: one confirmed order for today, and a master action runner. TEST database only.
import { and, eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { createServices, INIT_DATA_MAX_AGE_SECONDS } from '../src/composition';
import { createDatabase } from '../src/db/client';
import { orders, tasks, userRoles, users } from '../src/db/schema';
import { newId } from '../src/lib/ids';
import { createLogger } from '../src/logger';
import { permissionsOf } from '../src/modules/identity';
import { systemClock } from '../src/platform/clock';
import { createLocalFileStore } from '../src/storage/local-file-store';

const url = process.env.DATABASE_URL!;
if (!url.endsWith('_test')) throw new Error('only the test database');
const logger = createLogger({ level: 'warn', pretty: true });
const database = createDatabase(url, { logger });
const db = database.db;
const services = createServices({
  db,
  clock: systemClock,
  logger,
  botToken: 'x',
  initDataMaxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
  adminUrl: null,
  loginCodes: { send: () => Promise.reject(new Error('no')) },
  files: createLocalFileStore('./data/uploads'),
  mediaSecret: 'a-secret-that-is-at-least-thirty-two-chars',
});
const photoFile = process.env.PHOTO_FILE!;
const photo = new Uint8Array(readFileSync(photoFile));

const [owner] = await db
  .select({ id: users.id })
  .from(users)
  .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'owner')))
  .limit(1);
const staff = { kind: 'staff' as const, userId: owner!.id, roles: ['owner' as const], permissions: new Set(permissionsOf(['owner'])) };

const action = process.argv[2];

if (action === 'order') {
  const catalog = await services.catalog.offers.clientCatalog();
  const zone = (name: string) => catalog.serviceTypes.flatMap((t) => t.zones).find((z) => z.nameUz === name)!.id;
  const brand = catalog.brands.find((b) => b.name === 'Chevrolet')!;
  const model = brand.models.find((m) => m.name === 'Tracker 2') ?? brand.models[0]!;
  const [client] = await db
    .insert(users)
    .values({ fullName: 'Aziz Karimov', phone: '+998901112233', phoneVerified: true, telegramId: 880000201, consentVersion: 'x', consentAt: new Date() })
    .returning();
  const actor = { kind: 'client' as const, userId: client!.id, telegramId: 880000201, lang: 'uz' as const, fullName: 'Aziz Karimov', phone: '+998901112233' };
  const car = await services.garage.create(actor, { modelId: model.id, customModelText: null, bodyClass: null, year: 2021, plate: '01 A 777 BA', color: 'Oq' });
  // A client at the door: the staff may book the time that is soon.
  const startsAt = new Date(Math.ceil((Date.now() + 15 * 60_000) / (30 * 60_000)) * 30 * 60_000);
  const order = await services.adminOrders.create(staff, {
    clientId: client!.id,
    carId: car.id,
    serviceIds: [zone('Kapot'), zone('Old bamper')],
    startsAt,
    source: 'walk_in',
    confirmedByClient: true,
  });
  console.log(JSON.stringify({ orderId: order.id, number: order.number }));
}

if (action === 'act-sent') {
  const catalog = await services.catalog.offers.clientCatalog();
  const zone = (name: string) => catalog.serviceTypes.flatMap((t) => t.zones).find((z) => z.nameUz === name)!.id;
  const brand = catalog.brands.find((b) => b.name === 'Chevrolet')!;
  const model = brand.models.find((m) => m.name === 'Onix') ?? brand.models[0]!;
  const [client] = await db.select().from(users).where(eq(users.telegramId, 880000201));
  const actor = { kind: 'client' as const, userId: client!.id, telegramId: 880000201, lang: 'uz' as const, fullName: 'Aziz Karimov', phone: '+998901112233' };
  const car = await services.garage.create(actor, { modelId: model.id, customModelText: null, bodyClass: null, year: 2020, plate: '01 D 654 EF', color: 'Qora' });
  const startsAt = new Date(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) + 'T10:00:00+05:00');
  const order = await services.adminOrders.create(staff, { clientId: client!.id, carId: car.id, serviceIds: [zone('Kapot'), zone('Old bamper')], startsAt, source: 'phone', confirmedByClient: true });
  await services.reception.save(staff, order.id, { mileageKm: 63400, fuelLevel: 2, checklist: { jack: true, mats: true }, personalItems: 'Zaryadka', defects: [{ view: 'left', x: 0.4, y: 0.5, kind: 'scratch', note: 'Chap eshikda chiziq', mediaId: null }] });
  for (const side of ['front', 'back', 'left', 'right'] as const) {
    await services.reception.putPhoto(staff, order.id, { mediaId: newId(), purpose: 'side', side, bytes: photo });
  }
  await services.reception.send(staff, order.id);
  console.log(JSON.stringify({ orderId: order.id, number: order.number }));
}

if (action === 'to-work') {
  const orderId = process.argv[3]!;
  const [master] = await db.select({ id: users.id }).from(users).where(eq(users.fullName, 'Bekzod Aliyev'));
  await db.update(users).set({ telegramId: 880000401, consentVersion: 'x', consentAt: new Date() }).where(eq(users.id, master!.id));
  await services.reception.startWork(staff, orderId);
  const order = await services.adminOrders.get(staff, orderId);
  for (const item of order.items) {
    await services.taskService.create(staff, orderId, { masterId: master!.id, itemIds: [item.id], instruction: 'Ehtiyotkorlik bilan, ikki qatlam.' });
  }
  const catalog = await services.catalog.offers.clientCatalog();
  const glass = catalog.serviceTypes.flatMap((t) => t.zones).find((z) => z.nameUz === 'Old oyna')!.id;
  await services.extras.add(staff, orderId, { serviceId: glass, price: 350000 });
  console.log('in work, tasks given, extra asked');
}

if (action === 'master-work') {
  // Every task that is assigned: the master starts, takes photos and hands the report in.
  const rows = await db.select().from(tasks).where(eq(tasks.status, 'assigned'));
  for (const row of rows) {
    const [user] = await db.select().from(users).where(eq(users.id, row.masterId));
    const master = { kind: 'master' as const, userId: user!.id, telegramId: user!.telegramId ?? 0, lang: 'uz' as const, fullName: user!.fullName };
    await services.taskService.start(master, row.id);
    await services.taskService.putPhoto(master, row.id, { mediaId: newId(), kind: 'before', bytes: photo });
    await services.taskService.putPhoto(master, row.id, { mediaId: newId(), kind: 'after', bytes: photo });
    await services.taskService.putPhoto(master, row.id, { mediaId: newId(), kind: 'after', bytes: photo });
    await services.taskService.submit(master, row.id, 'Kuzov tozalandi, polirovka qilindi. Hammasi joyida.');
    console.log('handed in', row.id);
  }
}

if (action === 'master-redo') {
  const rows = await db.select().from(tasks).where(eq(tasks.status, 'rework'));
  for (const row of rows) {
    const [user] = await db.select().from(users).where(eq(users.id, row.masterId));
    const master = { kind: 'master' as const, userId: user!.id, telegramId: user!.telegramId ?? 0, lang: 'uz' as const, fullName: user!.fullName };
    await services.taskService.putPhoto(master, row.id, { mediaId: newId(), kind: 'after', bytes: photo });
    await services.taskService.submit(master, row.id, 'Qayta tozaladim.');
    console.log('redone', row.id);
  }
}

if (action === 'rework-review') {
  const rows = await db.select().from(tasks).where(eq(tasks.status, 'on_review'));
  for (const row of rows) {
    await services.taskService.rework(staff, row.id, 'Bamperning chap burchagida dog‘ qolgan, qaytadan tozalang.');
    console.log('sent back', row.id);
  }
}

if (action === 'status') {
  const [o] = await db.select({ status: orders.status }).from(orders).limit(1);
  console.log(JSON.stringify(o));
}
process.exit(0);
