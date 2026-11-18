import { describe, expect, it } from 'vitest';
import {
  adminDiscountCap,
  checkDiscount,
  rescaleDiscount,
  subtotalOf,
  totalsAt,
  unpricedOf,
} from '../../../src/modules/orders/domain/discount';
import { reviewActions, reviewStep } from '../../../src/modules/orders/domain/review';
import { handoverActions } from '../../../src/modules/orders/domain/staff-actions';
import { ORDER_STATUSES } from '@cs/shared/vocabulary';

describe('the subtotal: zones that count and have a price (PLAN 11)', () => {
  const items = [
    { approval: 'not_required', price: 1_400_000 },
    { approval: 'approved', price: 500_000 },
    { approval: 'pending', price: 300_000 },
    { approval: 'rejected', price: 200_000 },
    { approval: 'not_required', price: null },
    { approval: 'approved', price: null },
    { approval: 'rejected', price: null },
  ] as const;

  it('booked and agreed zones add up; unanswered, refused and unpriced ones do not', () => {
    expect(subtotalOf(items)).toBe(1_900_000);
  });

  it('the zones that block the handover are the unpriced ones that count', () => {
    expect(unpricedOf(items)).toEqual([
      { approval: 'not_required', price: null },
      { approval: 'approved', price: null },
    ]);
  });
});

describe('a discount: rounding and who may give how much (PLAN 11)', () => {
  const admin = { limitPct: 5, unlimited: false };
  const owner = { limitPct: 5, unlimited: true };

  it.each([
    // The design's example (A8): 5% of 3 400 000.
    [3_400_000, 5, 170_000],
    // Rounded half up to a whole so‘m.
    [3_000_010, 5, 150_001], // 150 000.5
    [3_000_009, 5, 150_000], // 150 000.45
    [999, 12.5, 125], // 124.875
    [1_000_000, 2.25, 22_500],
  ])('%s so‘m less %s%% is %s off', (subtotal, percent, amount) => {
    expect(checkDiscount({ subtotal, discount: { kind: 'percent', percent }, ...owner })).toEqual({
      ok: true,
      discount: { amount, percent },
    });
  });

  it.each([
    // The admin's cap is 5% of the subtotal, rounded the same way.
    ['exactly 5%', { kind: 'percent', percent: 5 }, true],
    ['5% as an amount', { kind: 'amount', amount: 150_000 }, true],
    ['one so‘m over 5%', { kind: 'amount', amount: 150_001 }, false],
    ['5.01%', { kind: 'percent', percent: 5.01 }, false],
    ['less than the cap', { kind: 'amount', amount: 1 }, true],
  ] as const)('an admin on 3 000 000: %s', (_case, discount, passes) => {
    const result = checkDiscount({ subtotal: 3_000_000, discount, ...admin });
    expect(result.ok).toBe(passes);
    if (!result.ok) expect(result.problem).toBe('over_limit');
  });

  it('the cap is rounded half up like the percentage itself', () => {
    expect(adminDiscountCap(3_000_010, 5)).toBe(150_001);
    expect(
      checkDiscount({
        subtotal: 3_000_010,
        discount: { kind: 'amount', amount: 150_001 },
        ...admin,
      }).ok,
    ).toBe(true);
    expect(
      checkDiscount({
        subtotal: 3_000_010,
        discount: { kind: 'amount', amount: 150_002 },
        ...admin,
      }).ok,
    ).toBe(false);
  });

  it('with a limit of 0% an admin gives nothing', () => {
    expect(
      checkDiscount({
        subtotal: 3_000_000,
        discount: { kind: 'amount', amount: 1 },
        limitPct: 0,
        unlimited: false,
      }),
    ).toEqual({ ok: false, problem: 'over_limit' });
  });

  it('the owner has no limit but the subtotal', () => {
    expect(
      checkDiscount({ subtotal: 3_000_000, discount: { kind: 'percent', percent: 100 }, ...owner }),
    ).toEqual({ ok: true, discount: { amount: 3_000_000, percent: 100 } });
    expect(
      checkDiscount({
        subtotal: 3_000_000,
        discount: { kind: 'amount', amount: 3_000_000 },
        ...owner,
      }),
    ).toEqual({ ok: true, discount: { amount: 3_000_000, percent: null } });
    expect(
      checkDiscount({
        subtotal: 3_000_000,
        discount: { kind: 'amount', amount: 3_000_001 },
        ...owner,
      }),
    ).toEqual({ ok: false, problem: 'over_subtotal' });
  });
});

describe('the discount follows the zones (PLAN 11)', () => {
  it.each([
    ['a percentage is taken again', { amount: 150_000, percent: 5 }, 4_000_000, 200_000],
    ['a percentage, rounded half up', { amount: 0, percent: 10 }, 1_234_565, 123_457],
    ['a percentage of nothing', { amount: 150_000, percent: 5 }, 0, 0],
    ['an amount stays', { amount: 150_000, percent: null }, 4_000_000, 150_000],
    ['an amount never exceeds the subtotal', { amount: 150_000, percent: null }, 100_000, 100_000],
  ])('%s', (_case, discount, subtotal, expected) => {
    expect(rescaleDiscount(discount, subtotal)).toBe(expected);
  });

  it('the total is the subtotal less the discount, and stays the subtotal without one', () => {
    expect(totalsAt({ discountAmount: 150_000, discountPercent: 5 }, 4_000_000)).toEqual({
      subtotal: 4_000_000,
      discount: 200_000,
      total: 3_800_000,
    });
    expect(totalsAt({ discountAmount: 0, discountPercent: null }, 4_000_000)).toEqual({
      subtotal: 4_000_000,
      discount: 0,
      total: 4_000_000,
    });
  });
});

describe('what the staff may do with the money of an order', () => {
  it.each(ORDER_STATUSES)('%s', (status) => {
    const open = ['new', 'confirmed', 'in_work', 'ready_for_pickup'].includes(status);
    const working = status === 'in_work' || status === 'ready_for_pickup';
    expect(handoverActions({ status, unpricedCount: 1, maySettle: true })).toEqual({
      canDiscount: open,
      canPriceItems: working,
      canCheckout: status === 'ready_for_pickup',
    });
    // Without `checkout.write` there is no discount and no checkout.
    const plain = handoverActions({ status, unpricedCount: 0, maySettle: false });
    expect(plain).toEqual({ canDiscount: false, canPriceItems: false, canCheckout: false });
  });
});

describe('the rating (PLAN 7.8, 12)', () => {
  const done = 'completed' as const;

  it.each(ORDER_STATUSES.filter((status) => status !== 'completed'))(
    'a %s order cannot be rated',
    (status) => {
      expect(reviewStep(status, null, { rating: 5, text: null })).toBe('invalid_transition');
      expect(reviewActions(status, null)).toEqual({ canRate: false, canComment: false });
    },
  );

  it.each([
    ['the first stars', null, { rating: 4, text: null }, 'create'],
    ['the first stars with words', null, { rating: 4, text: 'Zo‘r' }, 'create'],
    [
      'words for the stars from the bot',
      { rating: 4, text: null },
      { rating: 4, text: 'Zo‘r' },
      'add_text',
    ],
    ['other stars', { rating: 4, text: null }, { rating: 5, text: 'Zo‘r' }, 'already_decided'],
    [
      'stars again, no words',
      { rating: 4, text: null },
      { rating: 4, text: null },
      'already_decided',
    ],
    ['words again', { rating: 4, text: 'Zo‘r' }, { rating: 4, text: 'Yana' }, 'already_decided'],
  ] as const)('%s', (_case, existing, input, step) => {
    expect(reviewStep(done, existing, input)).toBe(step);
  });

  it('what the client may still do', () => {
    expect(reviewActions(done, null)).toEqual({ canRate: true, canComment: false });
    expect(reviewActions(done, { rating: 5, text: null })).toEqual({
      canRate: false,
      canComment: true,
    });
    expect(reviewActions(done, { rating: 5, text: 'Rahmat' })).toEqual({
      canRate: false,
      canComment: false,
    });
  });
});
