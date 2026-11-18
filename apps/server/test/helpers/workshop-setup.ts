import type { WorkDay } from '@cs/shared';
import type { Db } from '../../src/db/client';
import { seedReference } from '../../src/db/seeds/reference';
import type { ClientActor, StaffActor } from '../../src/platform/actors';
import { insertStaff, insertUser, staffActorOf, uniquePhone, uniqueTelegramId } from './factories';
import type { TestContext } from './services';

/**
 * A working workshop for the orders tests: the reference data, hours (Monday–Friday 09:00–20:00 with
 * a break 13:00–14:00, Saturday 10:00–16:00), two boxes that do ceramic coating, and a price list
 * for it. The fake clock starts on Thursday 2026-10-29 at 10:00 in Tashkent.
 */

const WEEKDAY = { open: '09:00', close: '20:00', breakStart: '13:00', breakEnd: '14:00' };

export const week: WorkDay[] = [
  ...[1, 2, 3, 4, 5].map((weekday) => ({ weekday, ...WEEKDAY })),
  { weekday: 6, open: '10:00', close: '16:00', breakStart: null, breakEnd: null },
];

export interface Workshop {
  owner: StaffActor;
  ceramicId: string;
  /** Ceramic zones by their Uzbek name. */
  zones: Record<'bonnet' | 'bumper' | 'full' | 'other', string>;
  boxes: { id: string; name: string }[];
  models: { onixS: string; tracker: string };
  admin: StaffActor;
}

/** Tashkent wall-clock time as an instant: `at('2026-10-30 10:00')`. */
export const at = (local: string): Date => new Date(`${local.replace(' ', 'T')}:00+05:00`);

export async function setupWorkshop(t: TestContext, db: Db): Promise<Workshop> {
  await seedReference(db);
  const owner = staffActorOf(await insertStaff(db, ['owner']), ['owner']);
  const adminUser = await insertStaff(db, ['admin']);
  const { workshop, catalog } = t.services;

  await workshop.hours.replaceWeek(owner, week);

  const types = await catalog.services.listTypes(owner);
  const ceramic = types.find((type) => type.code === 'ceramic');
  if (!ceramic) throw new Error('the reference data has no ceramic');
  const { services } = await catalog.services.prices(owner, ceramic.id);
  const zone = (name: string) => {
    const found = services.find((candidate) => candidate.nameUz === name);
    if (!found) throw new Error(`no zone ${name}`);
    return found.id;
  };
  const ids = {
    bonnet: zone('Kapot'),
    bumper: zone('Old bamper'),
    full: zone('To‘liq kuzov'),
    // The reference data has no "Other" in ceramic; the disks do for a zone without a price.
    other: zone('G‘ildirak disklari'),
  };
  await catalog.services.updatePrices(owner, ceramic.id, [
    { serviceId: ids.bonnet, bodyClass: 'S', price: 1_200_000, durationMin: 100 },
    { serviceId: ids.bonnet, bodyClass: 'M', price: 1_400_000, durationMin: 120 },
    { serviceId: ids.bumper, bodyClass: 'M', price: 1_600_000, durationMin: 150 },
    { serviceId: ids.full, bodyClass: 'M', price: 12_800_000, durationMin: 1_500 },
    { serviceId: ids.other, bodyClass: 'M', price: null, durationMin: 90 },
  ]);

  const boxes = [
    await workshop.boxes.create(owner, { name: '1-boks', serviceTypeIds: [ceramic.id] }),
    await workshop.boxes.create(owner, { name: '2-boks', serviceTypeIds: [ceramic.id] }),
  ];

  const brands = await catalog.brands.list(owner);
  const model = (brand: string, name: string) => {
    const found = brands
      .find((candidate) => candidate.name === brand)
      ?.models.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`no model ${brand} ${name}`);
    return found.id;
  };

  return {
    owner,
    admin: staffActorOf(adminUser, ['admin']),
    ceramicId: ceramic.id,
    zones: ids,
    boxes: boxes.map((box) => ({ id: box.id, name: box.name })),
    models: { onixS: model('Chevrolet', 'Onix'), tracker: model('Chevrolet', 'Tracker 2') },
  };
}

/** A client who has given consent and shared a verified phone, as the Mini App sees them. */
export async function makeClient(
  db: Db,
  overrides: { phoneVerified?: boolean; name?: string; telegram?: boolean } = {},
): Promise<ClientActor> {
  const verified = overrides.phoneVerified ?? true;
  const user = await insertUser(db, {
    fullName: overrides.name ?? 'Aziz Karimov',
    consent: true,
    phoneVerified: verified,
    phone: uniquePhone(),
    telegramId: overrides.telegram === false ? null : uniqueTelegramId(),
  });
  return {
    kind: 'client',
    userId: user.id,
    telegramId: user.telegramId ?? 0,
    lang: 'uz',
    fullName: user.fullName,
    phone: verified ? user.phone : null,
  };
}
