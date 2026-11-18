import { describe, expect, it } from 'vitest';
import { excludeProblems, type ZoneRef } from '../../../src/modules/catalog/domain/excludes';
import {
  changedCells,
  priceCellProblems,
  type PriceCell,
} from '../../../src/modules/catalog/domain/price-matrix';

const cell = (overrides: Partial<PriceCell> = {}): PriceCell => ({
  serviceId: 'bonnet',
  bodyClass: 'M',
  price: 1_400_000,
  durationMin: 120,
  ...overrides,
});

describe('the price matrix: one cell (PLAN 7.5)', () => {
  it.each([
    ['a price and a time', cell()],
    ['a price of zero (free)', cell({ price: 0 })],
    ['no price: to be agreed', cell({ price: null })],
    ['the shortest time', cell({ durationMin: 1 })],
    ['a job of many days', cell({ durationMin: 20_160 })],
    ['the largest price', cell({ price: 1_000_000_000 })],
  ])('%s is fine', (_name, one) => {
    expect(priceCellProblems([one])).toEqual([]);
  });

  it.each<[string, Partial<PriceCell>, string, string]>([
    ['a negative price', { price: -1 }, 'price', 'price_invalid'],
    ['a price with kopecks', { price: 10.5 }, 'price', 'price_invalid'],
    ['a price beyond reason', { price: 1_000_000_001 }, 'price', 'price_invalid'],
    ['a price that is not a number', { price: Number.NaN }, 'price', 'price_invalid'],
    ['no time at all', { durationMin: 0 }, 'durationMin', 'duration_invalid'],
    ['a negative time', { durationMin: -30 }, 'durationMin', 'duration_invalid'],
    ['a time with seconds', { durationMin: 90.5 }, 'durationMin', 'duration_invalid'],
    ['a time beyond two weeks', { durationMin: 20_161 }, 'durationMin', 'duration_invalid'],
    ['a fifth body class', { bodyClass: 'XXL' as never }, 'bodyClass', 'body_class_unknown'],
  ])('%s is refused', (_name, overrides, field, problem) => {
    expect(priceCellProblems([cell(overrides)])).toEqual([{ index: 0, field, problem }]);
  });

  it('the same zone and class twice is refused, naming the second', () => {
    expect(priceCellProblems([cell(), cell({ bodyClass: 'L' }), cell({ price: 1 })])).toEqual([
      { index: 2, field: 'bodyClass', problem: 'cell_repeated' },
    ]);
  });

  it('the same class in two zones is fine, and the four classes are all accepted', () => {
    const cells = ['S', 'M', 'L', 'XL'].flatMap((bodyClass) =>
      ['bonnet', 'bumper'].map((serviceId) =>
        cell({ serviceId, bodyClass: bodyClass as PriceCell['bodyClass'] }),
      ),
    );
    expect(priceCellProblems(cells)).toEqual([]);
  });

  it('the price of an "Other" zone is always agreed: a fixed price is refused', () => {
    const custom = new Set(['other']);
    expect(priceCellProblems([cell({ serviceId: 'other', price: null })], custom)).toEqual([]);
    expect(priceCellProblems([cell({ serviceId: 'other', price: 500_000 })], custom)).toEqual([
      { index: 0, field: 'price', problem: 'custom_zone_priced' },
    ]);
    expect(priceCellProblems([cell({ serviceId: 'bonnet', price: 500_000 })], custom)).toEqual([]);
  });

  it('every wrong cell is named at once', () => {
    expect(
      priceCellProblems([cell({ price: -1 }), cell({ bodyClass: 'L' }), cell({ durationMin: 0 })]),
    ).toEqual([
      { index: 0, field: 'price', problem: 'price_invalid' },
      { index: 2, field: 'bodyClass', problem: 'cell_repeated' },
      { index: 2, field: 'durationMin', problem: 'duration_invalid' },
    ]);
  });
});

describe('what changed in the matrix (for the audit log)', () => {
  const before = [
    cell({ bodyClass: 'S', price: 1_200_000, durationMin: 108 }),
    cell({ bodyClass: 'M', price: 1_400_000, durationMin: 120 }),
    cell({ bodyClass: 'L', price: 1_800_000, durationMin: 132 }),
  ];

  it('nothing changed: nothing to report', () => {
    expect(changedCells(before, [...before].reverse())).toEqual({ before: [], after: [] });
  });

  it('a new price is reported with the old one and the new one', () => {
    const after = [
      before[0]!,
      cell({ bodyClass: 'M', price: 1_500_000, durationMin: 120 }),
      before[2]!,
    ];
    expect(changedCells(before, after)).toEqual({
      before: [before[1]],
      after: [after[1]],
    });
  });

  it('a new time alone is a change', () => {
    const after = [before[0]!, before[1]!, { ...before[2]!, durationMin: 140 }];
    const changes = changedCells(before, after);
    expect(changes.before).toEqual([before[2]]);
    expect(changes.after).toEqual([after[2]]);
  });

  it('a price taken away (to be agreed) is a change', () => {
    const after = [before[0]!, { ...before[1]!, price: null }, before[2]!];
    expect(changedCells(before, after).after).toEqual([after[1]]);
  });

  it('a cell added has no "before", a cell removed has no "after"', () => {
    const added = cell({ bodyClass: 'XL', price: 1_950_000, durationMin: 144 });
    expect(changedCells(before, [...before, added])).toEqual({ before: [], after: [added] });
    expect(changedCells(before, [before[0]!, before[1]!])).toEqual({
      before: [before[2]],
      after: [],
    });
  });
});

describe('what choosing a zone removes (PLAN 7.5)', () => {
  const zones = new Map<string, ZoneRef>(
    [
      { id: 'full', serviceTypeId: 'ceramic' },
      { id: 'bonnet', serviceTypeId: 'ceramic' },
      { id: 'bumper', serviceTypeId: 'ceramic' },
      { id: 'seat', serviceTypeId: 'dry-clean' },
    ].map((zone) => [zone.id, zone]),
  );
  const full = zones.get('full')!;

  it('the panels of the same kind of work may be excluded', () => {
    expect(excludeProblems(full, ['bonnet', 'bumper'], zones)).toEqual([]);
    expect(excludeProblems(full, [], zones)).toEqual([]);
  });

  it.each([
    ['itself', 'full', 'excludes_itself'],
    ['a zone of another kind of work', 'seat', 'other_service_type'],
    ['a zone that does not exist', 'wheel', 'unknown_zone'],
  ])('%s is refused', (_name, excluded, problem) => {
    expect(excludeProblems(full, [excluded], zones)).toEqual([{ zoneId: excluded, problem }]);
  });

  it('a zone named twice is judged once', () => {
    expect(excludeProblems(full, ['seat', 'seat'], zones)).toHaveLength(1);
  });
});
