import { describe, expect, it } from 'vitest';
import {
  boxes,
  boxServiceTypes,
  carBrands,
  carModels,
  serviceExcludes,
  servicePrices,
  services,
  serviceTypes,
  settings,
  workHours,
} from '../../src/db/schema';
import { useTestDatabase } from '../helpers/db';

/**
 * What the database itself guarantees about the workshop's reference data (docs/PLAN.md, 7.4 and
 * 7.5): the rules hold even for a write that does not go through the use cases.
 */

const database = useTestDatabase();
const { db } = database;

/** PostgreSQL error classes: 23514 a CHECK, 23505 a unique index, 23503 a foreign key. */
const CHECK = { cause: { code: '23514' } };
const UNIQUE = { cause: { code: '23505' } };
const REFERENCE = { cause: { code: '23503' } };

const day = (overrides: Partial<typeof workHours.$inferInsert> = {}) => ({
  weekday: 1,
  open: '09:00',
  close: '20:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  ...overrides,
});

async function aType(code = 'ceramic') {
  const [type] = await db
    .insert(serviceTypes)
    .values({ code, nameUz: 'Keramika', nameRu: 'Керамика', icon: 'gem' })
    .returning();
  if (!type) throw new Error('no type');
  return type;
}

async function aZone(serviceTypeId: string, nameUz = 'Kapot') {
  const [zone] = await db
    .insert(services)
    .values({ serviceTypeId, nameUz, nameRu: nameUz, group: 'body' })
    .returning();
  if (!zone) throw new Error('no zone');
  return zone;
}

describe('working hours (PLAN 7.4)', () => {
  it('a normal day, with or without a break, is stored', async () => {
    await db.insert(workHours).values(day());
    await db.insert(workHours).values(day({ weekday: 6, breakStart: null, breakEnd: null }));
    expect(await db.select().from(workHours)).toHaveLength(2);
  });

  it.each([
    ['closing not after opening', day({ close: '09:00' })],
    ['closing before opening', day({ close: '08:00' })],
    ['a break with no end', day({ breakEnd: null })],
    ['a break with no start', day({ breakStart: null })],
    ['a break before opening', day({ breakStart: '08:00' })],
    ['a break after closing', day({ breakEnd: '21:00' })],
    ['a break that ends before it starts', day({ breakStart: '14:00', breakEnd: '13:00' })],
    ['weekday 0', day({ weekday: 0 })],
    ['weekday 8', day({ weekday: 8 })],
  ])('%s is refused by the database', async (_name, row) => {
    await expect(db.insert(workHours).values(row)).rejects.toMatchObject(CHECK);
  });

  it('a weekday has one row', async () => {
    await db.insert(workHours).values(day());
    await expect(db.insert(workHours).values(day())).rejects.toMatchObject(UNIQUE);
  });
});

describe('settings', () => {
  it('there is one row only', async () => {
    await db.insert(settings).values({ id: 1, data: {} });
    await expect(db.insert(settings).values({ id: 2, data: {} })).rejects.toMatchObject(CHECK);
    await expect(db.insert(settings).values({ id: 1, data: {} })).rejects.toMatchObject(UNIQUE);
  });
});

describe('brands and models (PLAN 7.5)', () => {
  it('a brand name is unique whatever the case', async () => {
    await db.insert(carBrands).values({ name: 'Chevrolet' });
    await expect(db.insert(carBrands).values({ name: 'chevrolet' })).rejects.toMatchObject(UNIQUE);
  });

  it('a model name is unique within its brand only', async () => {
    const [a, b] = await db
      .insert(carBrands)
      .values([{ name: 'Chery' }, { name: 'Haval' }])
      .returning();
    if (!a || !b) throw new Error('no brands');
    await db.insert(carModels).values({ brandId: a.id, name: 'M6', bodyClass: 'L' });
    await expect(
      db.insert(carModels).values({ brandId: a.id, name: 'm6', bodyClass: 'M' }),
    ).rejects.toMatchObject(UNIQUE);
    await db.insert(carModels).values({ brandId: b.id, name: 'M6', bodyClass: 'L' });
  });

  it('a model needs a brand and one of the four classes', async () => {
    await expect(
      db.insert(carModels).values({
        brandId: '019a0000-0000-7000-8000-000000000000',
        name: 'X',
        bodyClass: 'M',
      }),
    ).rejects.toMatchObject(REFERENCE);
    const [brand] = await db.insert(carBrands).values({ name: 'BYD' }).returning();
    await expect(
      db.insert(carModels).values({ brandId: brand!.id, name: 'X', bodyClass: 'XXL' as never }),
    ).rejects.toMatchObject({ cause: { code: '22P02' } });
  });
});

describe('prices and what zones exclude (PLAN 7.5)', () => {
  it('a price may be missing (to be agreed) or zero, never negative', async () => {
    const zone = await aZone((await aType()).id);
    await db.insert(servicePrices).values([
      { serviceId: zone.id, bodyClass: 'S', price: null, durationMin: 30 },
      { serviceId: zone.id, bodyClass: 'M', price: 0, durationMin: 30 },
    ]);
    await expect(
      db
        .insert(servicePrices)
        .values({ serviceId: zone.id, bodyClass: 'L', price: -1, durationMin: 30 }),
    ).rejects.toMatchObject(CHECK);
  });

  it('a duration is at least a minute', async () => {
    const zone = await aZone((await aType()).id);
    for (const durationMin of [0, -5]) {
      await expect(
        db
          .insert(servicePrices)
          .values({ serviceId: zone.id, bodyClass: 'S', price: 1, durationMin }),
      ).rejects.toMatchObject(CHECK);
    }
  });

  it('a zone has one cell per class', async () => {
    const zone = await aZone((await aType()).id);
    const cell = { serviceId: zone.id, bodyClass: 'S' as const, price: 1, durationMin: 30 };
    await db.insert(servicePrices).values(cell);
    await expect(db.insert(servicePrices).values(cell)).rejects.toMatchObject(UNIQUE);
  });

  it('a zone cannot exclude itself', async () => {
    const zone = await aZone((await aType()).id);
    await expect(
      db.insert(serviceExcludes).values({ serviceId: zone.id, excludedServiceId: zone.id }),
    ).rejects.toMatchObject(CHECK);
  });

  it('a kind of work’s code is unique', async () => {
    await aType('ceramic');
    await expect(aType('ceramic')).rejects.toMatchObject(UNIQUE);
  });
});

describe('boxes', () => {
  it('a box does only kinds of work that exist, each once', async () => {
    const [box] = await db.insert(boxes).values({ name: '1-boks' }).returning();
    const type = await aType();
    if (!box) throw new Error('no box');
    await db.insert(boxServiceTypes).values({ boxId: box.id, serviceTypeId: type.id });
    await expect(
      db.insert(boxServiceTypes).values({ boxId: box.id, serviceTypeId: type.id }),
    ).rejects.toMatchObject(UNIQUE);
    await expect(
      db.insert(boxServiceTypes).values({
        boxId: box.id,
        serviceTypeId: '019a0000-0000-7000-8000-000000000000',
      }),
    ).rejects.toMatchObject(REFERENCE);
  });
});
