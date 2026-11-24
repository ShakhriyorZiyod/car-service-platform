import { formatQty, formatQtyNumber, parseQty } from '@cs/shared/format';
import { describe, expect, it } from 'vitest';
import {
  averageCostAfterReceipt,
  isLow,
  lineProblems,
  lineSum,
  movementOf,
  productProblems,
  qtyFitsUnit,
  stockState,
} from '../../../src/modules/stock/domain/stock';

describe('the average cost after a receipt (PLAN 9.6)', () => {
  it.each([
    // onHand, avgCost, qty, unitCost → avg
    [0, 0, 30, 145_000, 145_000],
    [0, 99_000, 5, 100_000, 100_000],
    [10, 100_000, 10, 120_000, 110_000],
    [12.3, 140_000, 30, 145_000, 143_546],
    [3, 10, 1, 11, 10], // 10.25 → 10
    [1, 10, 1, 11, 11], // 10.5 → 11, half up
    [2, 0, 2, 1, 1], // 0.5 → 1
  ])('%d at %d plus %d at %d → %d', (onHand, avgCost, qty, unitCost, expected) => {
    expect(averageCostAfterReceipt({ onHand, avgCost, qty, unitCost })).toBe(expected);
  });

  it('a receipt brings goods in', () => {
    expect(() => averageCostAfterReceipt({ onHand: 1, avgCost: 1, qty: 0, unitCost: 1 })).toThrow();
  });
});

describe('how a posted line moves the stock (PLAN 9.6)', () => {
  const level = { onHand: 10, reserved: 3 };
  it.each<[Parameters<typeof movementOf>[0], number, { delta: number; short: boolean }]>([
    ['receipt', 5, { delta: 5, short: false }],
    ['write_off', 7, { delta: -7, short: false }],
    // Three are reserved for shop orders: only seven are free to write off.
    ['write_off', 8, { delta: -8, short: true }],
    ['inventory', 12, { delta: 2, short: false }],
    ['inventory', 10, { delta: 0, short: false }],
    ['inventory', 3, { delta: -7, short: false }],
    // Counting less than is promised to shop orders is refused.
    ['inventory', 2, { delta: -8, short: true }],
  ])('%s of %d', (kind, qty, expected) => {
    expect(movementOf(kind, qty, level)).toEqual(expected);
  });

  it('decimals stay exact', () => {
    expect(movementOf('inventory', 12.3, { onHand: 12.1, reserved: 0 }).delta).toBe(0.2);
  });
});

describe('the stock against the minimum', () => {
  it.each([
    [{ onHand: 0, reserved: 0 }, 5, 'out', true],
    [{ onHand: 5, reserved: 5 }, 0, 'out', false],
    [{ onHand: 5, reserved: 0 }, 5, 'low', true],
    [{ onHand: 6, reserved: 0 }, 5, 'ok', false],
    [{ onHand: 8, reserved: 3 }, 5, 'low', true],
    // No minimum: never low, only out when nothing is free.
    [{ onHand: 1, reserved: 0 }, 0, 'ok', false],
  ] as const)('%j with minimum %d is %s', (level, minQty, state, low) => {
    expect(stockState(level, minQty)).toBe(state);
    expect(isLow(level, minQty)).toBe(low);
  });
});

describe('the lines of a document', () => {
  const products = new Map([
    ['pcs', { unit: 'pcs' as const, isActive: true }],
    ['m2', { unit: 'm2' as const, isActive: true }],
  ]);
  const line = (productId: string, qty: number, unitCost: number | null = null) => ({
    productId,
    qty,
    unitCost,
  });

  it('a receipt names its price, the other kinds do not', () => {
    expect(lineProblems('receipt', [line('pcs', 2, 100)], products)).toEqual([]);
    expect(lineProblems('receipt', [line('pcs', 2)], products)).toEqual(['body.lines.0.unitCost']);
    expect(lineProblems('write_off', [line('pcs', 2, 100)], products)).toEqual([
      'body.lines.0.unitCost',
    ]);
  });

  it('pieces are whole; square metres take three decimals', () => {
    expect(lineProblems('write_off', [line('pcs', 1.5)], products)).toEqual(['body.lines.0.qty']);
    expect(lineProblems('write_off', [line('m2', 1.25)], products)).toEqual([]);
    expect(lineProblems('write_off', [line('m2', 1.2345)], products)).toEqual(['body.lines.0.qty']);
  });

  it('only an inventory counts zero; an unknown or repeated product is refused', () => {
    expect(lineProblems('write_off', [line('pcs', 0)], products)).toEqual(['body.lines.0.qty']);
    expect(lineProblems('inventory', [line('pcs', 0)], products)).toEqual([]);
    expect(lineProblems('inventory', [line('nope', 1)], products)).toEqual([
      'body.lines.0.productId',
    ]);
    expect(lineProblems('inventory', [line('pcs', 1), line('pcs', 2)], products)).toEqual([
      'body.lines.1.productId',
    ]);
  });
});

describe('a product card (PLAN 7.14)', () => {
  const card = {
    unit: 'pcs' as const,
    isForSale: true,
    isConsumable: false,
    sellPrice: 85_000,
    minQty: 10,
  };
  it.each([
    [{}, []],
    [{ unit: 'l' as const }, ['body.unit']],
    [{ sellPrice: null }, ['body.sellPrice']],
    [{ isForSale: false }, ['body.isForSale']],
    [{ isForSale: false, isConsumable: true, unit: 'l' as const, sellPrice: null }, []],
    [{ minQty: 1.5 }, ['body.minQty']],
  ])('%j → %j', (change, problems) => {
    expect(productProblems({ ...card, ...change })).toEqual(problems);
  });
});

const plain = (text: string) => text.replace(/\u00a0/g, ' ');

describe('quantities', () => {
  it('fit their unit', () => {
    expect(qtyFitsUnit(3, 'pcs')).toBe(true);
    expect(qtyFitsUnit(3.5, 'pcs')).toBe(false);
    expect(qtyFitsUnit(0.125, 'l')).toBe(true);
    expect(qtyFitsUnit(0.1255, 'l')).toBe(false);
  });

  it('a receipt line is summed to a whole so‘m', () => {
    expect(lineSum(30, 145_000)).toBe(4_350_000);
    expect(lineSum(1.4, 145_000)).toBe(203_000);
    expect(lineSum(0.333, 1_500)).toBe(500); // 499.5 → 500
  });

  it.each([
    [12.3, '12,3'],
    [42, '42'],
    [1234.5, '1 234,5'],
    [0.125, '0,125'],
    [-0.5, '−0,5'],
    [-1.25, '−1,25'],
  ])('%d reads %s', (value, text) => {
    // Numbers keep their groups together with non-breaking spaces.
    expect(plain(formatQtyNumber(value))).toBe(text);
  });

  it('are written with their unit', () => {
    expect(plain(formatQty(12.3, 'm2', 'uz'))).toBe('12,3 m²');
    expect(plain(formatQty(42, 'pcs', 'ru'))).toBe('42 шт.');
  });

  it.each([
    ['12,3', 12.3],
    ['12.3', 12.3],
    [' 1 000 ', 1000],
    ['0,125', 0.125],
    ['1,2345', null],
    ['abc', null],
    ['', null],
    ['-1', null],
  ])('"%s" parses to %s', (text, value) => {
    expect(parseQty(text)).toBe(value);
  });
});
