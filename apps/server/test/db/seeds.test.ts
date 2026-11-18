import { BODY_CLASSES } from '@cs/shared/vocabulary';
import { count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cancelReasons,
  carBrands,
  carModels,
  serviceExcludes,
  services,
  serviceTypes,
} from '../../src/db/schema';
import { seedDemo } from '../../src/db/seeds/demo';
import { DEMO_BOXES, DEMO_STAFF, DESIGN_PPF } from '../../src/db/seeds/demo-data';
import { seedReference } from '../../src/db/seeds/reference';
import { useTestDatabase } from '../helpers/db';
import { insertStaff, staffActorOf } from '../helpers/factories';
import { createTestServices, type TestContext } from '../helpers/services';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const rows = async (
  table:
    | typeof carBrands
    | typeof carModels
    | typeof services
    | typeof serviceTypes
    | typeof serviceExcludes
    | typeof cancelReasons,
) => {
  const [result] = await database.db.select({ n: count() }).from(table);
  return result?.n ?? 0;
};

describe('seed:reference (TZ 14.1, 14.2, 14.4)', () => {
  it('writes the brands and models, the kinds of work with their zones, and the cancel reasons', async () => {
    const report = await seedReference(database.db);
    expect(report).toEqual({
      brands: 5,
      models: 23,
      serviceTypes: 6,
      zones: 11 + 7 + 9 + 3 + 6 + 4,
      excludes: 5 + 4 + 6 + 5,
      cancelReasons: 9,
    });
    expect(await rows(carBrands)).toBe(5);
    expect(await rows(carModels)).toBe(23);
    expect(await rows(services)).toBe(40);
  });

  it('knows the body classes of TZ 14.1', async () => {
    await seedReference(database.db);
    const all = await database.db
      .select({ brand: carBrands.name, model: carModels.name, bodyClass: carModels.bodyClass })
      .from(carModels)
      .innerJoin(carBrands, eq(carBrands.id, carModels.brandId));
    const classOf = (brand: string, model: string) =>
      all.find((row) => row.brand === brand && row.model === model)?.bodyClass;
    expect(classOf('Chevrolet', 'Onix')).toBe('S');
    expect(classOf('Chevrolet', 'Tracker 2')).toBe('M');
    expect(classOf('BYD', 'Song Plus Champion')).toBe('L');
    expect(classOf('Chery', 'Tiggo 8 Pro')).toBe('XL');
    expect(classOf('Lada', 'Niva Legend')).toBe('M');
    expect(classOf('Haval', 'Dargo')).toBe('L');
  });

  it('"whole body" excludes the panels of its own kind of work, and nothing else', async () => {
    await seedReference(database.db);
    const owner = staffActorOf(await insertStaff(database.db, ['owner']), ['owner']);
    const types = await t.services.catalog.services.listTypes(owner);
    expect(types.map((type) => type.code)).toEqual([
      'polish',
      'ceramic',
      'ppf',
      'lamination',
      'dry_clean',
      'wash',
    ]);

    const ceramic = types.find((type) => type.code === 'ceramic');
    const { services: zones } = await t.services.catalog.services.prices(owner, ceramic!.id);
    const nameOf = new Map(zones.map((zone) => [zone.id, zone.nameUz]));
    const full = zones.find((zone) => zone.nameUz === 'To‘liq kuzov');
    expect(full?.excludes.map((id) => nameOf.get(id)).sort()).toEqual(
      ['Bagaj qopqog‘i', 'Kapot', 'Old bamper', 'Orqa bamper'].sort(),
    );
    expect(
      zones.filter((zone) => zone.id !== full?.id).every((zone) => zone.excludes.length === 0),
    ).toBe(true);
  });

  it('"Other" zones are marked, so their price is always agreed', async () => {
    await seedReference(database.db);
    const custom = await database.db
      .select({ nameUz: services.nameUz })
      .from(services)
      .where(eq(services.isCustom, true));
    expect(custom).toHaveLength(2);
    expect(custom.every((zone) => zone.nameUz === 'Boshqa')).toBe(true);
  });

  it('the cancel reasons include the system’s "no contact"', async () => {
    await seedReference(database.db);
    const [system] = await database.db
      .select()
      .from(cancelReasons)
      .where(eq(cancelReasons.appliesTo, 'system'));
    expect(system).toMatchObject({ code: 'no_contact', requiresText: false });
    const [other] = await database.db
      .select()
      .from(cancelReasons)
      .where(eq(cancelReasons.code, 'other'));
    expect(other?.requiresText).toBe(true);
  });

  it('running it again adds nothing', async () => {
    await seedReference(database.db);
    const again = await seedReference(database.db);
    expect(again).toEqual({
      brands: 0,
      models: 0,
      serviceTypes: 0,
      zones: 0,
      excludes: 0,
      cancelReasons: 0,
    });
    expect([await rows(carBrands), await rows(carModels), await rows(serviceTypes)]).toEqual([
      5, 23, 6,
    ]);
    expect([await rows(services), await rows(serviceExcludes), await rows(cancelReasons)]).toEqual([
      40, 20, 9,
    ]);
  });

  it('two runs at once write the data once', async () => {
    await Promise.all([seedReference(database.db), seedReference(database.db)]);
    expect([await rows(carBrands), await rows(services), await rows(cancelReasons)]).toEqual([
      5, 40, 9,
    ]);
  });

  it('what the owner changed or hid is not brought back', async () => {
    await seedReference(database.db);
    await database.db
      .update(carBrands)
      .set({ name: 'LADA (VAZ)', isActive: false })
      .where(eq(carBrands.name, 'Lada'));
    await database.db
      .update(serviceTypes)
      .set({ nameUz: 'Polirovka' })
      .where(eq(serviceTypes.code, 'polish'));

    await seedReference(database.db);
    expect(await rows(carBrands)).toBe(5);
    expect(
      await database.db.select().from(carBrands).where(eq(carBrands.name, 'Lada')),
    ).toHaveLength(0);
    expect(
      (await database.db.select().from(serviceTypes).where(eq(serviceTypes.code, 'polish')))[0]
        ?.nameUz,
    ).toBe('Polirovka');
  });

  it('fills only the group that is empty', async () => {
    await database.db.insert(carBrands).values({ name: 'Ravon' });
    const report = await seedReference(database.db);
    expect(report.brands).toBe(0);
    expect(report.serviceTypes).toBe(6);
    expect(await rows(carBrands)).toBe(1);
  });
});

describe('seed:demo', () => {
  async function demo() {
    await seedReference(database.db);
    const owner = staffActorOf(await insertStaff(database.db, ['owner']), ['owner']);
    return { owner, report: await seedDemo(t.services, owner) };
  }

  it('needs the reference data first', async () => {
    const owner = staffActorOf(await insertStaff(database.db, ['owner']), ['owner']);
    await expect(seedDemo(t.services, owner)).rejects.toThrow(/seed:reference/);
  });

  it('writes hours, boxes, prices and staff that obey the same rules as the panel', async () => {
    const { owner, report } = await demo();
    expect(report).toMatchObject({ hours: true, holidays: 4, boxes: 4 });
    expect(report.pricedTypes).toHaveLength(6);
    expect(report.staff).toHaveLength(DEMO_STAFF.length);

    const hours = await t.services.workshop.hours.get(owner);
    expect(hours.days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await t.services.workshop.boxes.list(owner)).toHaveLength(DEMO_BOXES.length);
  });

  it('every zone has a cell for every body class, and "Other" is always to be agreed', async () => {
    const { owner } = await demo();
    for (const type of await t.services.catalog.services.listTypes(owner)) {
      const { services: zones } = await t.services.catalog.services.prices(owner, type.id);
      for (const zone of zones) {
        expect(zone.cells.map((cell) => cell.bodyClass)).toEqual([...BODY_CLASSES]);
        if (zone.isCustom) expect(zone.cells.every((cell) => cell.price === null)).toBe(true);
        else expect(zone.cells.every((cell) => cell.price !== null && cell.price > 0)).toBe(true);
      }
    }
  });

  it('the bronplyonka matrix is the design’s (admin PDF, page 13)', async () => {
    const { owner } = await demo();
    const ppf = (await t.services.catalog.services.listTypes(owner)).find(
      (type) => type.code === 'ppf',
    );
    const { services: zones } = await t.services.catalog.services.prices(owner, ppf!.id);
    const bonnet = zones.find((zone) => zone.nameUz === 'Kapot');
    expect(bonnet?.cells).toEqual([
      { bodyClass: 'S', price: 1_200_000, durationMin: 108 },
      { bodyClass: 'M', price: 1_400_000, durationMin: 120 },
      { bodyClass: 'L', price: 1_800_000, durationMin: 132 },
      { bodyClass: 'XL', price: 1_950_000, durationMin: 144 },
    ]);
    expect(Object.keys(DESIGN_PPF)).toHaveLength(9);
  });

  it('running it again adds nothing', async () => {
    const { owner } = await demo();
    const again = await seedDemo(t.services, owner);
    expect(again).toEqual({ hours: false, holidays: 0, boxes: 0, pricedTypes: [], staff: [] });
    expect(await t.services.workshop.boxes.list(owner)).toHaveLength(4);
  });

  it('the demo admin signs in with the demo password, and masters have no login', async () => {
    await demo();
    const result = await t.services.identity.auth.signIn({
      identifier: 'demo-admin',
      password: 'demo-password-1',
      ip: '127.0.0.1',
      userAgent: null,
    });
    expect(result.kind).toBe('signed_in');
    const owner = staffActorOf(await insertStaff(database.db, ['owner']), ['owner']);
    const staff = await t.services.identity.staff.list(owner);
    expect(
      staff
        .filter((member) => member.roles.includes('master'))
        .every((member) => member.login === null),
    ).toBe(true);
  });
});
