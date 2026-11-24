import type {
  ProductUnit,
  StockDocumentKind,
  StockState,
  WriteOffReason,
} from '@cs/shared/vocabulary';

/**
 * Rules of the warehouse (docs/PLAN.md, section 9.6). Pure: the use cases ask these questions and
 * write what they answer.
 */

/** Quantities keep three decimals (numeric(12,3)); this drops what floating point adds. */
export const roundQty = (value: number): number => Math.round(value * 1000) / 1000;

/** Whether a quantity fits the product's unit: goods in pieces are whole. */
export const qtyFitsUnit = (qty: number, unit: ProductUnit): boolean =>
  Number.isFinite(qty) && (unit === 'pcs' ? Number.isInteger(qty) : roundQty(qty) === qty);

/**
 * The average cost after a receipt, so‘m per unit, rounded half up (section 9.6). From an empty
 * stock it is the price of the receipt. Goods going out do not change it.
 */
export function averageCostAfterReceipt(input: {
  onHand: number;
  avgCost: number;
  qty: number;
  unitCost: number;
}): number {
  const { onHand, avgCost, qty, unitCost } = input;
  if (qty <= 0) throw new RangeError(`a receipt brings goods in: ${qty}`);
  if (onHand <= 0) return unitCost;
  const total = onHand * avgCost + qty * unitCost;
  // Half up on a value that floating point may have put a hair below .5.
  return Math.floor(total / (onHand + qty) + 0.5 + 1e-9);
}

export interface LineInput {
  productId: string;
  qty: number;
  unitCost: number | null;
}

export interface ProductFacts {
  unit: ProductUnit;
  isActive: boolean;
}

/** What is wrong with the lines of a document, as request paths; empty when they are fine. */
export function lineProblems(
  kind: StockDocumentKind,
  lines: readonly LineInput[],
  products: ReadonlyMap<string, ProductFacts>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const at = (field: string) => `body.lines.${index}.${field}`;
    const product = products.get(line.productId);
    if (!product || seen.has(line.productId)) {
      problems.push(at('productId'));
      return;
    }
    seen.add(line.productId);
    const counted = kind === 'inventory';
    if (!qtyFitsUnit(line.qty, product.unit) || line.qty < 0 || (!counted && line.qty === 0)) {
      problems.push(at('qty'));
    }
    if (kind === 'receipt' && (line.unitCost === null || line.unitCost < 0)) {
      problems.push(at('unitCost'));
    }
    if (kind !== 'receipt' && line.unitCost !== null) problems.push(at('unitCost'));
  });
  return problems;
}

/** A document can be posted only with lines, and a write-off only with a reason. */
export function postProblems(document: {
  kind: StockDocumentKind;
  reason: WriteOffReason | null;
  lineCount: number;
}): string[] {
  const problems: string[] = [];
  if (document.lineCount === 0) problems.push('lines');
  if (document.kind === 'write_off' && document.reason === null) problems.push('reason');
  return problems;
}

export interface Level {
  onHand: number;
  reserved: number;
}

/**
 * How a posted line moves the stock: in for a receipt, out for a write-off, the difference for an
 * inventory (none when the count agrees). `short` says that the stock cannot give that much: a
 * write-off may take only the free stock, and an inventory may not count less than is reserved.
 */
export function movementOf(
  kind: Exclude<StockDocumentKind, 'sale'>,
  qty: number,
  level: Level,
): { delta: number; short: boolean } {
  const free = roundQty(level.onHand - level.reserved);
  switch (kind) {
    case 'receipt':
      return { delta: qty, short: false };
    case 'write_off':
      return { delta: -qty, short: qty > free };
    case 'inventory':
      return { delta: roundQty(qty - level.onHand), short: qty < level.reserved };
  }
}

/** The free stock against the minimum (section 9.6): `out` when nothing is free. */
export function stockState(level: Level, minQty: number): StockState {
  const free = roundQty(level.onHand - level.reserved);
  if (free <= 0) return 'out';
  if (minQty > 0 && free <= minQty) return 'low';
  return 'ok';
}

/** Below the minimum: what the "Bugun" block and the daily message list. */
export const isLow = (level: Level, minQty: number): boolean =>
  minQty > 0 && roundQty(level.onHand - level.reserved) <= minQty;

/** One message a day (section 12): the outbox drops a second one with the same key. */
export const stockDigestKey = (localDate: string): string => `stock_low:${localDate}`;

export interface ProductCard {
  unit: ProductUnit;
  isForSale: boolean;
  isConsumable: boolean;
  sellPrice: number | null;
  minQty: number;
}

/**
 * What is wrong with a product card, as request paths (section 7.14): goods for sale are counted
 * in pieces and have a price, every product is for sale or a consumable, and the minimum fits the
 * unit. The database checks the same; this names the field.
 */
export function productProblems(card: ProductCard): string[] {
  const problems: string[] = [];
  if (!card.isForSale && !card.isConsumable) problems.push('body.isForSale');
  if (card.isForSale && card.unit !== 'pcs') problems.push('body.unit');
  if (card.isForSale && card.sellPrice === null) problems.push('body.sellPrice');
  if (!qtyFitsUnit(card.minQty, card.unit)) problems.push('body.minQty');
  return problems;
}

/** A receipt's sum at its invoice prices: each line rounded half up to a whole so‘m. */
export const lineSum = (qty: number, unitCost: number): number =>
  Math.floor(roundQty(qty) * unitCost + 0.5 + 1e-9);
