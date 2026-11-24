import { BODY_CLASSES, type BodyClass } from '@cs/shared/vocabulary';
import type { Services } from '../../composition';
import type { StaffActor } from '../../platform/actors';
import {
  CLASS_PRICE_FACTOR,
  CLASS_TIME_FACTOR,
  DEMO_BASE,
  DEMO_BOXES,
  DEMO_HOLIDAYS,
  DEMO_PASSWORD,
  DEMO_STAFF,
  DEMO_WEEK,
  DESIGN_PPF,
  type PriceAndMinutes,
} from './demo-data';
import { DEMO_INVOICE, DEMO_PRODUCTS, DEMO_SUPPLIER } from './demo-stock-data';

/**
 * `npm run seed:demo` (docs/PLAN.md, section 18, stages 2 and 8): a workshop to click through, in
 * development only. It goes through the same use cases as the panel, so the demo data obeys the
 * same rules, and it fills only what is still empty, so running it again adds nothing.
 *
 * The reference data (`seed:reference`) must be there first.
 */

export interface DemoSeedReport {
  hours: boolean;
  holidays: number;
  boxes: number;
  pricedTypes: string[];
  staff: string[];
  /** Stage 8: the warehouse. */
  products: number;
  /** The number of the posted demo receipt; null when the warehouse was not empty. */
  receipt: number | null;
}

/** A price to the nearest five thousand so‘m: scaled numbers should still look like prices. */
const roundPrice = (price: number): number => Math.round(price / 5_000) * 5_000;

function cellFor(
  bodyClass: BodyClass,
  zone: string,
  typeCode: string,
): { price: number | null; durationMin: number } {
  const exact = typeCode === 'ppf' ? DESIGN_PPF[zone]?.[bodyClass] : undefined;
  if (exact) return { price: exact[0], durationMin: exact[1] };

  const base: PriceAndMinutes | undefined = DEMO_BASE[typeCode]?.[zone];
  if (!base) throw new Error(`the demo has no price for ${typeCode} / ${zone}`);
  const [price, minutes] = base;
  return {
    price: price === null ? null : roundPrice(price * CLASS_PRICE_FACTOR[bodyClass]),
    durationMin: Math.max(1, Math.round(minutes * CLASS_TIME_FACTOR[bodyClass])),
  };
}

export async function seedDemo(services: Services, owner: StaffActor): Promise<DemoSeedReport> {
  const { workshop, catalog, identity, stock } = services;
  const report: DemoSeedReport = {
    hours: false,
    holidays: 0,
    boxes: 0,
    pricedTypes: [],
    staff: [],
    products: 0,
    receipt: null,
  };

  const types = await catalog.services.listTypes(owner);
  if (types.length === 0)
    throw new Error('No kinds of work yet: run `npm run seed:reference` first.');
  const typeIdOf = new Map(types.map((type) => [type.code, type.id]));

  const hours = await workshop.hours.get(owner);
  if (hours.days.length === 0) {
    await workshop.hours.replaceWeek(owner, DEMO_WEEK);
    report.hours = true;
  }
  const knownHolidays = new Set(hours.holidays.map((holiday) => holiday.date));
  for (const holiday of DEMO_HOLIDAYS) {
    if (knownHolidays.has(holiday.date)) continue;
    await workshop.hours.addHoliday(owner, holiday);
    report.holidays += 1;
  }

  if ((await workshop.boxes.list(owner)).length === 0) {
    for (const box of DEMO_BOXES) {
      await workshop.boxes.create(owner, {
        name: box.name,
        note: box.note ?? null,
        serviceTypeIds: box.serviceTypes.map((code) => {
          const id = typeIdOf.get(code);
          if (!id) throw new Error(`the demo box ${box.name} needs the kind of work "${code}"`);
          return id;
        }),
      });
      report.boxes += 1;
    }
  }

  for (const type of types) {
    const matrix = await catalog.services.prices(owner, type.id);
    const alreadyPriced = matrix.services.some((zone) => zone.cells.length > 0);
    if (alreadyPriced || matrix.services.length === 0) continue;
    const cells = matrix.services.flatMap((zone) =>
      BODY_CLASSES.map((bodyClass) => ({
        serviceId: zone.id,
        bodyClass,
        ...cellFor(bodyClass, zone.nameUz, type.code),
      })),
    );
    await catalog.services.updatePrices(owner, type.id, cells);
    report.pricedTypes.push(type.code);
  }

  const existing = new Set((await identity.staff.list(owner)).map((member) => member.phone));
  for (const member of DEMO_STAFF) {
    if (existing.has(member.phone)) continue;
    await identity.staff.create(owner, {
      fullName: member.fullName,
      phone: member.phone,
      roles: member.roles,
      specialization: member.specialization ?? null,
      ...(member.login && { login: member.login, password: DEMO_PASSWORD }),
    });
    report.staff.push(member.fullName);
  }

  if ((await stock.products.list(owner)).length === 0) {
    const categories = await stock.products.categories(owner);
    const categoryOf = new Map(categories.map((category) => [category.nameUz, category.id]));
    const supplier = await stock.products.createSupplier(owner, DEMO_SUPPLIER);
    const lines = [];
    for (const item of DEMO_PRODUCTS) {
      const categoryId = categoryOf.get(item.category);
      if (!categoryId) {
        throw new Error(`the demo product ${item.sku} needs the category "${item.category}"`);
      }
      const product = await stock.products.create(owner, {
        sku: item.sku,
        barcode: null,
        nameUz: item.nameUz,
        nameRu: item.nameRu,
        descriptionUz: null,
        descriptionRu: null,
        categoryId,
        brand: null,
        unit: item.unit,
        pack: item.pack ?? null,
        isForSale: item.isForSale,
        isConsumable: item.isConsumable,
        sellPrice: item.sellPrice ?? null,
        minQty: item.minQty,
      });
      report.products += 1;
      if (item.received > 0) {
        lines.push({ productId: product.id, qty: item.received, unitCost: item.unitCost });
      }
    }
    const receipt = await stock.documents.create(owner, {
      kind: 'receipt',
      supplierId: supplier.id,
      ...DEMO_INVOICE,
      reason: null,
      note: null,
      lines,
    });
    await stock.documents.post(owner, receipt.id);
    report.receipt = receipt.number;
  }

  return report;
}

export { DEMO_PASSWORD };
