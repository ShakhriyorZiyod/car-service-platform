import type { ItemApproval } from '@cs/shared/vocabulary';
import { percentOf } from '../../../lib/money';

/**
 * The order's money (docs/PLAN.md, section 11). Pure: the order's zones and the rules arrive as
 * arguments.
 *
 * - `subtotal`: the prices of the zones that count (booked ones and agreed extra work); a zone
 *   "to be agreed" has no price yet and adds nothing.
 * - The discount is on the whole order, as a percentage or an amount, with a reason. A percentage
 *   is rounded half up to a whole so‘m. An admin may give up to `adminDiscountLimitPct` of the
 *   subtotal, the owner up to the whole subtotal.
 * - When the zones change, a percentage is taken again of the new subtotal, and an amount stays
 *   unless the subtotal fell below it.
 */

/** A zone counts when nobody has to agree to it, or the client agreed. */
export const countsTowardTotal = (item: { approval: ItemApproval }): boolean =>
  item.approval === 'not_required' || item.approval === 'approved';

export function subtotalOf(
  items: readonly { approval: ItemApproval; price: number | null }[],
): number {
  return items.reduce(
    (sum, item) => sum + (countsTowardTotal(item) && item.price !== null ? item.price : 0),
    0,
  );
}

/** The zones that count but have no price: the car cannot be handed over until they do. */
export const unpricedOf = <T extends { approval: ItemApproval; price: number | null }>(
  items: readonly T[],
): T[] => items.filter((item) => countsTowardTotal(item) && item.price === null);

export type DiscountInput =
  { kind: 'percent'; percent: number } | { kind: 'amount'; amount: number };

export interface Discount {
  amount: number;
  /** Null when it was given as an amount. */
  percent: number | null;
}

export type DiscountProblem =
  /** Above the admin's limit; the owner may give it. */
  | 'over_limit'
  /** More than there is to discount. */
  | 'over_subtotal';

/** The most an admin may give off this subtotal. */
export const adminDiscountCap = (subtotal: number, limitPct: number): number =>
  percentOf(subtotal, limitPct);

export function checkDiscount(input: {
  subtotal: number;
  discount: DiscountInput;
  /** The admin's limit from the workshop's rules, in percent. */
  limitPct: number;
  /** The owner: no limit but the subtotal. */
  unlimited: boolean;
}): { ok: true; discount: Discount } | { ok: false; problem: DiscountProblem } {
  const { subtotal, discount } = input;
  const amount =
    discount.kind === 'percent' ? percentOf(subtotal, discount.percent) : discount.amount;
  if (amount > subtotal) return { ok: false, problem: 'over_subtotal' };
  if (!input.unlimited && amount > adminDiscountCap(subtotal, input.limitPct)) {
    return { ok: false, problem: 'over_limit' };
  }
  return {
    ok: true,
    discount: { amount, percent: discount.kind === 'percent' ? discount.percent : null },
  };
}

/** The discount after the subtotal changed (the zones were edited, extra work was agreed). */
export function rescaleDiscount(discount: Discount, subtotal: number): number {
  if (discount.percent !== null) return percentOf(subtotal, discount.percent);
  return Math.min(discount.amount, subtotal);
}

/** The order's sums at a new subtotal, the discount it has following along. */
export function totalsAt(
  order: { discountAmount: number; discountPercent: number | null },
  subtotal: number,
): { subtotal: number; discount: number; total: number } {
  const hasDiscount = order.discountAmount > 0 || order.discountPercent !== null;
  const discount = hasDiscount
    ? rescaleDiscount({ amount: order.discountAmount, percent: order.discountPercent }, subtotal)
    : 0;
  return { subtotal, discount, total: subtotal - discount };
}
