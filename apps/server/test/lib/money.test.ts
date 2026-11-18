import { describe, expect, it } from 'vitest';
import { isMoney, percentOf } from '../../src/lib/money';

describe('isMoney: whole, non-negative so‘m', () => {
  it.each([0, 1, 3_400_000, Number.MAX_SAFE_INTEGER])('%s is money', (value) => {
    expect(isMoney(value)).toBe(true);
  });

  it.each([-1, 0.5, 1_400_000.01, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    '%s is not money',
    (value) => {
      expect(isMoney(value)).toBe(false);
    },
  );
});

describe('percentOf: a percentage rounded half up to a whole so‘m', () => {
  it.each([
    // The discount in the design (A8): 5% of 3 400 000.
    [3_400_000, 5, 170_000],
    [1_000, 0, 0],
    [1_000, 100, 1_000],
    // Exactly half a so‘m goes up.
    [1_005, 50, 503],
    [1_003, 50, 502],
    // Below half goes down, above half goes up.
    [999, 12.5, 125], // 124.875
    [10, 2.5, 0], // 0.25
    [30, 2.5, 1], // 0.75
    // Two decimals, where floating-point multiplication alone would drift.
    [1_000_000, 7.25, 72_500],
    [123_457, 33.33, 41_148], // 41 148.2181
    [1, 0.01, 0],
  ])('%s × %s%% = %s', (amount, percent, expected) => {
    expect(percentOf(amount, percent)).toBe(expected);
  });

  it.each([
    ['a negative amount', -100, 5],
    ['a fractional amount', 100.5, 5],
    ['a negative percentage', 100, -1],
    ['more than 100%', 100, 100.01],
    ['three decimals', 100, 5.125],
    ['NaN', 100, Number.NaN],
  ])('rejects %s', (_case, amount, percent) => {
    expect(() => percentOf(amount, percent)).toThrow(RangeError);
  });

  it('rejects an amount too large to compute exactly', () => {
    expect(() => percentOf(Number.MAX_SAFE_INTEGER, 50)).toThrow(RangeError);
  });
});
