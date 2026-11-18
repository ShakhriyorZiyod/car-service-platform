/**
 * Money rules (docs/PLAN.md, sections 2 and 11): amounts are whole so‘m, never fractions. The
 * only place a fraction appears is a percentage, and it is rounded half up to a whole so‘m.
 */

/** A whole, non-negative amount of so‘m that JavaScript still adds exactly. */
export function isMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

const BASIS_POINTS_PER_PERCENT = 100;
const BASIS_POINTS_TOTAL = 100 * BASIS_POINTS_PER_PERCENT;

/**
 * `percent` of `amount`, rounded half up to a whole so‘m: 5% of 3 400 000 is 170 000.
 * The percentage may have up to two decimals (12.5, 7.25). The arithmetic is done in whole basis
 * points, so the result is exact and does not depend on floating-point rounding.
 */
export function percentOf(amount: number, percent: number): number {
  if (!isMoney(amount)) throw new RangeError(`not an amount of money: ${amount}`);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`not a percentage between 0 and 100: ${percent}`);
  }
  const basisPoints = Math.round(percent * BASIS_POINTS_PER_PERCENT);
  if (Math.abs(percent * BASIS_POINTS_PER_PERCENT - basisPoints) > 1e-6) {
    throw new RangeError(`a percentage has at most two decimals: ${percent}`);
  }
  const scaled = amount * basisPoints;
  if (!Number.isSafeInteger(scaled)) throw new RangeError(`amount is too large: ${amount}`);
  return Math.floor((scaled + BASIS_POINTS_TOTAL / 2) / BASIS_POINTS_TOTAL);
}
