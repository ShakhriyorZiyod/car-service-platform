import { BODY_CLASSES, LIMITS, type BodyClass } from '@cs/shared/vocabulary';

/**
 * The price matrix (docs/PLAN.md, section 7.5): for every zone and every body class a price and
 * the working time it takes. A missing cell means the zone is not offered for that class.
 */

export interface PriceCell {
  serviceId: string;
  bodyClass: BodyClass;
  /** So‘m; null means the price is agreed with the client. */
  price: number | null;
  /** Working minutes. */
  durationMin: number;
}

export type PriceCellField = 'bodyClass' | 'price' | 'durationMin';

export type PriceCellProblem =
  | 'body_class_unknown'
  | 'price_invalid'
  | 'duration_invalid'
  | 'cell_repeated'
  | 'custom_zone_priced';

export interface PriceCellIssue {
  /** Which cell of the list. */
  index: number;
  field: PriceCellField;
  problem: PriceCellProblem;
}

const isWholeIn = (value: number, min: number, max: number): boolean =>
  Number.isSafeInteger(value) && value >= min && value <= max;

/**
 * Everything wrong with a list of cells, so a form can mark each of them.
 * `customServiceIds` are the "Other" zones: their price is always agreed, never fixed.
 */
export function priceCellProblems(
  cells: readonly PriceCell[],
  customServiceIds: ReadonlySet<string> = new Set(),
): PriceCellIssue[] {
  const issues: PriceCellIssue[] = [];
  const seen = new Set<string>();

  cells.forEach((cell, index) => {
    if (!(BODY_CLASSES as readonly string[]).includes(cell.bodyClass)) {
      issues.push({ index, field: 'bodyClass', problem: 'body_class_unknown' });
    }
    const key = `${cell.serviceId}:${cell.bodyClass}`;
    if (seen.has(key)) issues.push({ index, field: 'bodyClass', problem: 'cell_repeated' });
    seen.add(key);

    if (cell.price !== null && !isWholeIn(cell.price, 0, LIMITS.price.max)) {
      issues.push({ index, field: 'price', problem: 'price_invalid' });
    } else if (cell.price !== null && customServiceIds.has(cell.serviceId)) {
      issues.push({ index, field: 'price', problem: 'custom_zone_priced' });
    }
    if (!isWholeIn(cell.durationMin, LIMITS.durationMin.min, LIMITS.durationMin.max)) {
      issues.push({ index, field: 'durationMin', problem: 'duration_invalid' });
    }
  });
  return issues;
}

export interface PriceChanges {
  /** What the changed or removed cells were. */
  before: PriceCell[];
  /** What the new or changed cells are now. */
  after: PriceCell[];
}

const keyOf = (cell: PriceCell): string => `${cell.serviceId}:${cell.bodyClass}`;

/** Only the cells that differ: the audit log keeps these, not the whole matrix. */
export function changedCells(
  before: readonly PriceCell[],
  after: readonly PriceCell[],
): PriceChanges {
  const was = new Map(before.map((cell) => [keyOf(cell), cell]));
  const is = new Map(after.map((cell) => [keyOf(cell), cell]));
  const differs = (a: PriceCell | undefined, b: PriceCell | undefined): boolean =>
    a?.price !== b?.price ||
    a?.durationMin !== b?.durationMin ||
    (a === undefined) !== (b === undefined);

  return {
    before: before.filter((cell) => differs(cell, is.get(keyOf(cell)))),
    after: after.filter((cell) => differs(was.get(keyOf(cell)), cell)),
  };
}
