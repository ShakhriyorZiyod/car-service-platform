import type { PriceCell as PriceCellView } from '@cs/shared';
import type { Role } from '@cs/shared/vocabulary';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { auditLog } from '../../../src/db/schema';
import { useTestDatabase } from '../../helpers/db';
import { insertStaff, staffActorOf } from '../../helpers/factories';
import { createTestServices, type TestContext } from '../../helpers/services';

const database = useTestDatabase();
let t: TestContext;
beforeEach(() => {
  t = createTestServices(database.db);
});

const brands = () => t.services.catalog.brands;
const catalog = () => t.services.catalog.services;

async function actorWith(roles: Role[]) {
  const user = await insertStaff(database.db, roles);
  return staffActorOf(user, roles);
}
const owner = () => actorWith(['owner']);

const auditRows = (action: string) =>
  database.db.select().from(auditLog).where(eq(auditLog.action, action)).orderBy(asc(auditLog.id));

const MISSING = '019a0000-0000-7000-8000-000000000000';

async function makeType(code = 'ceramic') {
  return catalog().createType(await owner(), {
    code,
    nameUz: 'Keramika',
    nameRu: 'Керамика',
    icon: 'gem',
  });
}

async function makeZone(
  serviceTypeId: string,
  nameUz: string,
  extra: { isCustom?: boolean; group?: 'body' | 'glass' | 'interior' | 'other' } = {},
) {
  return catalog().createService(await owner(), {
    serviceTypeId,
    nameUz,
    nameRu: nameUz,
    group: extra.group ?? 'body',
    ...(extra.isCustom !== undefined && { isCustom: extra.isCustom }),
  });
}

const cellOf = (
  serviceId: string,
  bodyClass: 'S' | 'M' | 'L' | 'XL',
  price: number | null,
  durationMin = 60,
) => ({
  serviceId,
  bodyClass,
  price,
  durationMin,
});

describe('only the owner edits the catalog (PLAN 8)', () => {
  it.each<Role[]>([['admin'], ['director'], ['master']])('%j is refused', async (...roles) => {
    const actor = await actorWith(roles);
    const type = await makeType();
    const zone = await makeZone(type.id, 'Kapot');
    const brand = await brands().createBrand(await owner(), { name: 'Chevrolet' });
    const refused = { code: 'forbidden' };

    await expect(brands().list(actor)).rejects.toMatchObject(refused);
    await expect(brands().createBrand(actor, { name: 'BYD' })).rejects.toMatchObject(refused);
    await expect(brands().updateBrand(actor, brand.id, { name: 'X' })).rejects.toMatchObject(
      refused,
    );
    await expect(
      brands().createModel(actor, { brandId: brand.id, name: 'Onix', bodyClass: 'S' }),
    ).rejects.toMatchObject(refused);
    await expect(catalog().listTypes(actor)).rejects.toMatchObject(refused);
    await expect(
      catalog().createType(actor, { code: 'polish', nameUz: 'a', nameRu: 'b', icon: 'x' }),
    ).rejects.toMatchObject(refused);
    await expect(catalog().prices(actor, type.id)).rejects.toMatchObject(refused);
    await expect(
      catalog().updatePrices(actor, type.id, [cellOf(zone.id, 'M', 1)]),
    ).rejects.toMatchObject(refused);
    await expect(catalog().updateService(actor, zone.id, { nameUz: 'X' })).rejects.toMatchObject(
      refused,
    );
    expect((await catalog().prices(await owner(), type.id)).services[0]?.cells).toEqual([]);
  });
});

describe('brands and models (PLAN 7.5)', () => {
  it('a brand and its models, in the order they were added', async () => {
    const actor = await owner();
    const chevrolet = await brands().createBrand(actor, { name: 'Chevrolet' });
    const byd = await brands().createBrand(actor, { name: 'BYD' });
    await brands().createModel(actor, { brandId: chevrolet.id, name: 'Onix', bodyClass: 'S' });
    await brands().createModel(actor, { brandId: chevrolet.id, name: 'Tracker 2', bodyClass: 'M' });
    await brands().createModel(actor, { brandId: byd.id, name: 'Han', bodyClass: 'L' });

    const list = await brands().list(actor);
    expect(list.map((brand) => brand.name)).toEqual(['Chevrolet', 'BYD']);
    expect(list[0]?.models.map((model) => [model.name, model.bodyClass])).toEqual([
      ['Onix', 'S'],
      ['Tracker 2', 'M'],
    ]);
    expect(list[1]?.models).toHaveLength(1);
  });

  it('a brand name is taken whatever the case, even by a hidden brand', async () => {
    const actor = await owner();
    const brand = await brands().createBrand(actor, { name: 'Chevrolet' });
    await expect(brands().createBrand(actor, { name: 'CHEVROLET' })).rejects.toMatchObject({
      code: 'name_taken',
    });
    await brands().updateBrand(actor, brand.id, { isActive: false });
    await expect(brands().createBrand(actor, { name: 'chevrolet' })).rejects.toMatchObject({
      code: 'name_taken',
    });
    const other = await brands().createBrand(actor, { name: 'BYD' });
    await expect(
      brands().updateBrand(actor, other.id, { name: 'Chevrolet' }),
    ).rejects.toMatchObject({
      code: 'name_taken',
    });
    expect(await brands().list(actor)).toHaveLength(2);
  });

  it('a model name is taken within its brand only', async () => {
    const actor = await owner();
    const a = await brands().createBrand(actor, { name: 'Chery' });
    const b = await brands().createBrand(actor, { name: 'Haval' });
    await brands().createModel(actor, { brandId: a.id, name: 'M6', bodyClass: 'L' });
    await expect(
      brands().createModel(actor, { brandId: a.id, name: 'm6', bodyClass: 'M' }),
    ).rejects.toMatchObject({ code: 'name_taken' });
    await expect(
      brands().createModel(actor, { brandId: b.id, name: 'M6', bodyClass: 'L' }),
    ).resolves.toMatchObject({ name: 'M6' });
  });

  it('a model of a brand that does not exist is refused', async () => {
    await expect(
      brands().createModel(await owner(), { brandId: MISSING, name: 'Onix', bodyClass: 'S' }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.brandId'] } });
  });

  it('a model changes its class, name and visibility; the class change is audited', async () => {
    const actor = await owner();
    const brand = await brands().createBrand(actor, { name: 'BYD' });
    const model = await brands().createModel(actor, {
      brandId: brand.id,
      name: 'Song Plus',
      bodyClass: 'L',
    });

    const updated = await brands().updateModel(actor, model.id, {
      bodyClass: 'XL',
      isActive: false,
    });
    expect(updated).toMatchObject({ bodyClass: 'XL', isActive: false });

    const [row] = await auditRows('model.update');
    expect(row).toMatchObject({
      actorId: actor.userId,
      entityId: model.id,
      before: { bodyClass: 'L', isActive: true },
      after: { bodyClass: 'XL', isActive: false },
    });
  });

  it('a change that changes nothing is not audited; things that do not exist are not_found', async () => {
    const actor = await owner();
    const brand = await brands().createBrand(actor, { name: 'BYD' });
    await brands().updateBrand(actor, brand.id, { name: 'BYD' });
    expect(await auditRows('brand.update')).toHaveLength(0);
    await expect(brands().updateBrand(actor, MISSING, { name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(brands().updateModel(actor, MISSING, { name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('hiding a brand keeps it and its models', async () => {
    const actor = await owner();
    const brand = await brands().createBrand(actor, { name: 'Lada' });
    await brands().createModel(actor, { brandId: brand.id, name: 'Granta', bodyClass: 'S' });
    await brands().updateBrand(actor, brand.id, { isActive: false });
    const [kept] = await brands().list(actor);
    expect(kept).toMatchObject({ name: 'Lada', isActive: false });
    expect(kept?.models).toHaveLength(1);
  });
});

describe('kinds of work and their zones (PLAN 7.5)', () => {
  it('a kind of work is created with a code that cannot be reused', async () => {
    const actor = await owner();
    const type = await makeType('ceramic');
    expect(type).toMatchObject({ code: 'ceramic', isActive: true });
    await expect(makeType('ceramic')).rejects.toMatchObject({ code: 'name_taken' });
    expect(await catalog().listTypes(actor)).toHaveLength(1);
  });

  it('its names, icon and visibility change; the code does not', async () => {
    const actor = await owner();
    const type = await makeType();
    const updated = await catalog().updateType(actor, type.id, {
      nameUz: 'Keramik qoplama',
      isActive: false,
    });
    expect(updated).toMatchObject({ code: 'ceramic', nameUz: 'Keramik qoplama', isActive: false });
    expect(await auditRows('service_type.update')).toHaveLength(1);
  });

  it('zones are added to a kind of work, in order, and "Other" is marked', async () => {
    const type = await makeType();
    await makeZone(type.id, 'Kapot');
    await makeZone(type.id, 'Boshqa', { isCustom: true, group: 'other' });
    const { services } = await catalog().prices(await owner(), type.id);
    expect(services.map((zone) => [zone.nameUz, zone.isCustom])).toEqual([
      ['Kapot', false],
      ['Boshqa', true],
    ]);
  });

  it('a zone of a kind of work that does not exist is refused', async () => {
    await expect(
      catalog().createService(await owner(), {
        serviceTypeId: MISSING,
        nameUz: 'Kapot',
        nameRu: 'Капот',
        group: 'body',
      }),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.serviceTypeId'] } });
  });

  it('a zone is renamed, regrouped and hidden; it is not deleted', async () => {
    const actor = await owner();
    const type = await makeType();
    const zone = await makeZone(type.id, 'Kapot');
    const updated = await catalog().updateService(actor, zone.id, {
      nameUz: 'Dvigatel qopqog‘i',
      group: 'other',
      isActive: false,
    });
    expect(updated).toMatchObject({ nameUz: 'Dvigatel qopqog‘i', group: 'other', isActive: false });
    expect((await auditRows('service.update'))[0]).toMatchObject({
      before: { nameUz: 'Kapot' },
      after: { nameUz: 'Dvigatel qopqog‘i' },
    });
  });

  describe('what a zone excludes', () => {
    it('the zones of the same kind of work, and the list can be replaced and emptied', async () => {
      const actor = await owner();
      const type = await makeType();
      const full = await makeZone(type.id, 'To‘liq kuzov');
      const bonnet = await makeZone(type.id, 'Kapot');
      const bumper = await makeZone(type.id, 'Bamper');

      const first = await catalog().updateService(actor, full.id, {
        excludes: [bonnet.id, bumper.id],
      });
      expect([...first.excludes].sort()).toEqual([bonnet.id, bumper.id].sort());
      const second = await catalog().updateService(actor, full.id, { excludes: [bonnet.id] });
      expect(second.excludes).toEqual([bonnet.id]);
      expect((await catalog().updateService(actor, full.id, { excludes: [] })).excludes).toEqual(
        [],
      );
    });

    it('not itself, not another kind of work, not a zone that does not exist', async () => {
      const actor = await owner();
      const ceramic = await makeType('ceramic');
      const dry = await makeType('dry_clean');
      const full = await makeZone(ceramic.id, 'To‘liq kuzov');
      const seat = await makeZone(dry.id, 'O‘rindiqlar');
      const bonnet = await makeZone(ceramic.id, 'Kapot');
      await catalog().updateService(actor, full.id, { excludes: [bonnet.id] });

      for (const wrong of [full.id, seat.id, MISSING]) {
        await expect(
          catalog().updateService(actor, full.id, { excludes: [wrong] }),
        ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.excludes'] } });
      }
      // The refused attempts left the list as it was.
      expect(
        (await catalog().prices(actor, ceramic.id)).services.find((z) => z.id === full.id)
          ?.excludes,
      ).toEqual([bonnet.id]);
    });
  });
});

describe('the price matrix (PLAN 7.5)', () => {
  async function setup() {
    const actor = await owner();
    const type = await makeType();
    const bonnet = await makeZone(type.id, 'Kapot');
    const bumper = await makeZone(type.id, 'Old bamper');
    return { actor, type, bonnet, bumper };
  }

  it('all the cells of a kind of work are saved together and read back by class', async () => {
    const { actor, type, bonnet, bumper } = await setup();
    const matrix = await catalog().updatePrices(actor, type.id, [
      cellOf(bonnet.id, 'XL', 1_950_000, 144),
      cellOf(bonnet.id, 'S', 1_200_000, 108),
      cellOf(bumper.id, 'M', 1_600_000, 150),
    ]);

    const cells = (id: string) => matrix.services.find((zone) => zone.id === id)?.cells;
    expect(cells(bonnet.id)).toEqual<PriceCellView[]>([
      { bodyClass: 'S', price: 1_200_000, durationMin: 108 },
      { bodyClass: 'XL', price: 1_950_000, durationMin: 144 },
    ]);
    expect(cells(bumper.id)).toEqual([{ bodyClass: 'M', price: 1_600_000, durationMin: 150 }]);
    expect(await catalog().prices(actor, type.id)).toEqual(matrix);
  });

  it('a cell that is left out is deleted: the zone is not offered for that class any more', async () => {
    const { actor, type, bonnet } = await setup();
    await catalog().updatePrices(actor, type.id, [
      cellOf(bonnet.id, 'S', 1),
      cellOf(bonnet.id, 'M', 2),
    ]);
    const matrix = await catalog().updatePrices(actor, type.id, [cellOf(bonnet.id, 'M', 2)]);
    expect(matrix.services[0]?.cells.map((cell) => cell.bodyClass)).toEqual(['M']);
    expect((await catalog().updatePrices(actor, type.id, [])).services[0]?.cells).toEqual([]);
  });

  it('no price means "to be agreed" and zero is a price', async () => {
    const { actor, type, bonnet } = await setup();
    const matrix = await catalog().updatePrices(actor, type.id, [
      cellOf(bonnet.id, 'S', null),
      cellOf(bonnet.id, 'M', 0),
    ]);
    expect(matrix.services[0]?.cells.map((cell) => cell.price)).toEqual([null, 0]);
  });

  it('refuses a cell that breaks a rule and names it, and saves nothing', async () => {
    const { actor, type, bonnet, bumper } = await setup();
    await catalog().updatePrices(actor, type.id, [cellOf(bonnet.id, 'S', 1_000)]);

    await expect(
      catalog().updatePrices(actor, type.id, [
        cellOf(bonnet.id, 'S', 2_000),
        cellOf(bumper.id, 'M', -5),
        cellOf(bumper.id, 'L', 10, 0),
      ]),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { paths: ['body.cells.1.price', 'body.cells.2.durationMin'] },
    });
    const { services } = await catalog().prices(actor, type.id);
    expect(services.find((zone) => zone.id === bonnet.id)?.cells[0]?.price).toBe(1_000);
    expect(services.find((zone) => zone.id === bumper.id)?.cells).toEqual([]);
  });

  it('refuses a zone that belongs to another kind of work', async () => {
    const { actor, type } = await setup();
    const other = await makeType('polish');
    const stranger = await makeZone(other.id, 'Fara');
    await expect(
      catalog().updatePrices(actor, type.id, [cellOf(stranger.id, 'M', 1)]),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.cells.0.serviceId'] } });
    await expect(
      catalog().updatePrices(actor, MISSING, [cellOf(stranger.id, 'M', 1)]),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('a kind of work’s matrix leaves other kinds of work alone', async () => {
    const { actor, type, bonnet } = await setup();
    const other = await makeType('polish');
    const fara = await makeZone(other.id, 'Fara');
    await catalog().updatePrices(actor, other.id, [cellOf(fara.id, 'M', 500_000)]);
    await catalog().updatePrices(actor, type.id, [cellOf(bonnet.id, 'M', 1_400_000)]);
    await catalog().updatePrices(actor, type.id, []);
    expect((await catalog().prices(actor, other.id)).services[0]?.cells).toHaveLength(1);
  });

  it('the price of an "Other" zone cannot be fixed, only agreed', async () => {
    const { actor, type } = await setup();
    const custom = await makeZone(type.id, 'Boshqa', { isCustom: true, group: 'other' });
    await expect(
      catalog().updatePrices(actor, type.id, [cellOf(custom.id, 'M', 100_000)]),
    ).rejects.toMatchObject({ code: 'validation', details: { paths: ['body.cells.0.price'] } });
    await expect(
      catalog().updatePrices(actor, type.id, [cellOf(custom.id, 'M', null, 60)]),
    ).resolves.toBeDefined();
  });

  it('a price change is audited: only the cells that changed, with the zone’s name', async () => {
    const { actor, type, bonnet, bumper } = await setup();
    await catalog().updatePrices(actor, type.id, [
      cellOf(bonnet.id, 'M', 1_400_000, 120),
      cellOf(bumper.id, 'M', 1_600_000, 150),
    ]);
    await catalog().updatePrices(actor, type.id, [
      cellOf(bonnet.id, 'M', 1_500_000, 120),
      cellOf(bumper.id, 'M', 1_600_000, 150),
    ]);

    const rows = await auditRows('prices.update');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      actorId: actor.userId,
      entity: 'service_type',
      entityId: type.id,
      before: { code: 'ceramic', cells: [{ zone: 'Kapot', bodyClass: 'M', price: 1_400_000 }] },
      after: { code: 'ceramic', cells: [{ zone: 'Kapot', bodyClass: 'M', price: 1_500_000 }] },
    });
  });

  it('saving the same matrix again changes nothing and is not audited', async () => {
    const { actor, type, bonnet } = await setup();
    await catalog().updatePrices(actor, type.id, [cellOf(bonnet.id, 'M', 1_400_000)]);
    await catalog().updatePrices(actor, type.id, [cellOf(bonnet.id, 'M', 1_400_000)]);
    expect(await auditRows('prices.update')).toHaveLength(1);
  });

  it('two saves at once end in one of them, not a mix', async () => {
    const { actor, type, bonnet, bumper } = await setup();
    const a = [cellOf(bonnet.id, 'M', 1), cellOf(bumper.id, 'M', 1)];
    const b = [cellOf(bonnet.id, 'M', 2), cellOf(bumper.id, 'M', 2)];
    await Promise.all([
      catalog().updatePrices(actor, type.id, a),
      catalog().updatePrices(actor, type.id, b),
    ]);
    const prices = (await catalog().prices(actor, type.id)).services.map(
      (zone) => zone.cells[0]?.price,
    );
    expect(prices[0]).toBe(prices[1]);
  });
});
