import { ORDER_STATUSES } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import { cashSummary, checkCheckout } from '../../../src/modules/payments/domain/checkout';

/** A ready order of 3 230 000 so‘m with every zone priced, paid in full in cash. */
const ready = {
  status: 'ready_for_pickup',
  total: 3_230_000,
  unpricedCount: 0,
  payments: [{ method: 'cash', amount: 3_230_000 }],
  receiptNo: 'K-000123',
} as const;

describe('checkout conditions (PLAN 11)', () => {
  it('a ready, priced order paid in full with a receipt number passes', () => {
    expect(checkCheckout(ready)).toBeNull();
  });

  it.each(ORDER_STATUSES.filter((status) => status !== 'ready_for_pickup'))(
    'not from %s',
    (status) => {
      expect(checkCheckout({ ...ready, status })).toBe('invalid_transition');
    },
  );

  it('not while a zone that counts has no price', () => {
    expect(checkCheckout({ ...ready, unpricedCount: 1 })).toBe('unpriced_items');
  });

  it.each([
    ['one so‘m short', [{ method: 'cash', amount: 3_229_999 }]],
    ['one so‘m over', [{ method: 'cash', amount: 3_230_001 }]],
    ['nothing', []],
    [
      'a mix that does not add up',
      [
        { method: 'cash', amount: 1_000_000 },
        { method: 'card_terminal', amount: 2_000_000 },
      ],
    ],
  ] as const)('the payments must add up to the total: %s', (_case, payments) => {
    expect(checkCheckout({ ...ready, payments })).toBe('payment_mismatch');
  });

  it('a mixed payment that adds up passes (design A8)', () => {
    expect(
      checkCheckout({
        ...ready,
        payments: [
          { method: 'cash', amount: 1_000_000 },
          { method: 'card_terminal', amount: 2_230_000 },
        ],
      }),
    ).toBeNull();
  });

  it.each([
    ['no receipt number', ''],
    ['only spaces', '   '],
    ['longer than 64 characters', '1'.repeat(65)],
  ])('%s is refused', (_case, receiptNo) => {
    expect(checkCheckout({ ...ready, receiptNo })).toBe('receipt_missing');
  });

  it('a receipt number of 64 characters, spaces around it trimmed, passes', () => {
    expect(checkCheckout({ ...ready, receiptNo: ` ${'1'.repeat(64)} ` })).toBeNull();
  });

  it.each([
    [
      'the same method twice',
      [
        { method: 'cash', amount: 1_000_000 },
        { method: 'cash', amount: 2_230_000 },
      ],
    ],
    [
      'a payment of nothing',
      [
        { method: 'cash', amount: 3_230_000 },
        { method: 'transfer', amount: 0 },
      ],
    ],
    ['a fraction of a so‘m', [{ method: 'cash', amount: 3_229_999.5 }]],
  ] as const)('%s is refused', (_case, payments) => {
    expect(checkCheckout({ ...ready, payments })).toBe('bad_payments');
  });

  it('a free order (a 100% discount) is handed over with no payment', () => {
    expect(checkCheckout({ ...ready, total: 0, payments: [] })).toBeNull();
  });

  it('the status is checked first: a finished order is not "unpriced" or "mismatched"', () => {
    expect(checkCheckout({ ...ready, status: 'completed', unpricedCount: 2, payments: [] })).toBe(
      'invalid_transition',
    );
  });
});

describe('the day’s takings (design A6)', () => {
  it('adds up by method and in all, to the so‘m', () => {
    expect(
      cashSummary(
        [
          { method: 'cash', amount: 1_000_000 },
          { method: 'card_terminal', amount: 2_230_000 },
          { method: 'cash', amount: 1_340_000 },
          { method: 'transfer', amount: 600_000 },
        ],
        3,
      ),
    ).toEqual({
      byMethod: { cash: 2_340_000, card_terminal: 2_230_000, transfer: 600_000 },
      total: 5_170_000,
      receipts: 3,
    });
  });

  it('a day without money is zero, not missing', () => {
    expect(cashSummary([], 0)).toEqual({
      byMethod: { cash: 0, card_terminal: 0, transfer: 0 },
      total: 0,
      receipts: 0,
    });
  });
});
