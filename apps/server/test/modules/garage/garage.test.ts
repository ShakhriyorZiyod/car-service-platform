import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../helpers/db';
import { createTestServices, type TestContext } from '../../helpers/services';
import { makeClient, setupWorkshop, type Workshop } from '../../helpers/workshop-setup';

const database = useTestDatabase();
let t: TestContext;
let shop: Workshop;
beforeEach(async () => {
  t = createTestServices(database.db);
  shop = await setupWorkshop(t, database.db);
});

const garage = () => t.services.garage;

const car = (overrides: object = {}) => ({
  modelId: shop.models.onixS,
  customModelText: null,
  bodyClass: null,
  year: 2021,
  plate: '01 A 777 BA',
  color: 'oq',
  ...overrides,
});

describe('the client’s garage (PLAN 7.6)', () => {
  it('a car from the list takes its body class from the model and keeps the plate in one form', async () => {
    const client = await makeClient(database.db);
    const created = await garage().create(client, car());
    expect(created).toMatchObject({
      brand: 'Chevrolet',
      model: 'Onix',
      bodyClass: 'S',
      plate: '01A777BA',
      year: 2021,
    });
    expect(await garage().list(client)).toEqual([created]);
  });

  it('the plate may be typed any way: small letters, with Cyrillic look-alikes', async () => {
    const client = await makeClient(database.db);
    expect((await garage().create(client, car({ plate: '01 а 777 ва' }))).plate).toBe('01A777BA');
  });

  it('"Other": the client’s own words and the class they picked; neither alone is enough', async () => {
    const client = await makeClient(database.db);
    const custom = await garage().create(
      client,
      car({ modelId: null, customModelText: 'Daewoo Matiz', bodyClass: 'S' }),
    );
    expect(custom).toMatchObject({
      modelId: null,
      brand: null,
      model: 'Daewoo Matiz',
      bodyClass: 'S',
    });

    await expect(
      garage().create(
        client,
        car({ modelId: null, customModelText: 'Daewoo Matiz', plate: '01B111CD' }),
      ),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.bodyClass'] } });
    await expect(
      garage().create(client, car({ modelId: null, customModelText: null, plate: '01B222CD' })),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it.each([
    ['a plate that is not one', { plate: 'not a plate' }, 'body.plate'],
    ['a year before cars', { year: 1900 }, 'body.year'],
    ['a year far ahead', { year: 2040 }, 'body.year'],
    ['both a model and words', { customModelText: 'Matiz' }, 'body.customModelText'],
  ])('%s is refused', async (_name, overrides, path) => {
    const client = await makeClient(database.db);
    await expect(garage().create(client, car(overrides))).rejects.toMatchObject({
      code: 'validation',
      details: { paths: [path] },
    });
    expect(await garage().list(client)).toEqual([]);
  });

  it('without a verified phone there is no garage', async () => {
    const client = await makeClient(database.db, { phoneVerified: false });
    await expect(garage().create(client, car())).rejects.toMatchObject({ code: 'phone_required' });
  });

  it('a plate is one car of a client, but another client may have it', async () => {
    const first = await makeClient(database.db);
    const second = await makeClient(database.db);
    await garage().create(first, car());
    await expect(garage().create(first, car({ plate: '01a777ba' }))).rejects.toMatchObject({
      code: 'plate_taken',
    });
    await expect(garage().create(second, car())).resolves.toMatchObject({ plate: '01A777BA' });
  });

  it('a car’s plate is free again once the car is archived', async () => {
    const client = await makeClient(database.db);
    const first = await garage().create(client, car());
    await garage().archive(client, first.id);
    expect(await garage().list(client)).toEqual([]);
    await expect(garage().create(client, car())).resolves.toMatchObject({ plate: '01A777BA' });
  });

  it('somebody else’s car is not found, whatever is asked of it', async () => {
    const owner = await makeClient(database.db);
    const stranger = await makeClient(database.db);
    const mine = await garage().create(owner, car());
    await expect(garage().update(stranger, mine.id, { color: 'qora' })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(garage().archive(stranger, mine.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(garage().own(stranger.userId, mine.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await garage().list(stranger)).toEqual([]);
  });

  it('a car is changed: its model brings a new class, its colour and year follow', async () => {
    const client = await makeClient(database.db);
    const created = await garage().create(client, car());
    const changed = await garage().update(client, created.id, {
      modelId: shop.models.tracker,
      color: 'qora',
      year: 2023,
    });
    expect(changed).toMatchObject({
      model: 'Tracker 2',
      bodyClass: 'M',
      color: 'qora',
      year: 2023,
    });
  });

  it('changing to a plate of another of the client’s cars is refused', async () => {
    const client = await makeClient(database.db);
    await garage().create(client, car());
    const second = await garage().create(client, car({ plate: '01B222CD' }));
    await expect(garage().update(client, second.id, { plate: '01A777BA' })).rejects.toMatchObject({
      code: 'plate_taken',
    });
  });
});
