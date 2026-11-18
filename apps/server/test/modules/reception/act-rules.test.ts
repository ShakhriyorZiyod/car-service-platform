import { ACT_STATUSES, ORDER_STATUSES, PHOTO_SIDES } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import {
  actActions,
  canActTransition,
  canClientConfirm,
  missingForSend,
} from '../../../src/modules/reception/domain/act';

describe('what an act lacks before it can be sent (PLAN 9.4)', () => {
  it('needs the mileage, the fuel and all four sides', () => {
    expect(missingForSend({ mileageKm: null, fuelLevel: null, photographedSides: [] })).toEqual([
      'mileage',
      'fuel',
      'front',
      'back',
      'left',
      'right',
    ]);
  });

  it.each([
    ['only the mileage is missing', 45_000, null, PHOTO_SIDES, ['fuel']],
    ['mileage zero is a mileage', 0, 0, PHOTO_SIDES, []],
    ['one side is missing', 45_000, 2, ['front', 'back', 'left'], ['right']],
    ['no photos', 45_000, 2, [], ['front', 'back', 'left', 'right']],
    ['a complete act', 120_500, 4, ['right', 'left', 'back', 'front'], []],
  ] as const)('%s', (_name, mileageKm, fuelLevel, sides, expected) => {
    expect(missingForSend({ mileageKm, fuelLevel, photographedSides: sides })).toEqual(expected);
  });
});

describe('the act’s transitions (PLAN 9.4)', () => {
  const allowed = new Set([
    'draft>sent:admin',
    'sent>draft:admin',
    'sent>confirmed:client',
    'sent>confirmed:admin',
    'draft>confirmed:admin',
  ]);
  const cases = ACT_STATUSES.flatMap((from) =>
    ACT_STATUSES.flatMap((to) =>
      (['admin', 'client'] as const).map((by) => ({
        from,
        to,
        by,
        ok: allowed.has(`${from}>${to}:${by}`),
      })),
    ),
  );

  it.each(cases)('$from → $to by $by: $ok', ({ from, to, by, ok }) => {
    expect(canActTransition(from, to, by)).toBe(ok);
  });

  it('a confirmed act never goes back', () => {
    for (const to of ACT_STATUSES) {
      for (const by of ['admin', 'client'] as const) {
        expect(canActTransition('confirmed', to, by)).toBe(false);
      }
    }
  });
});

describe('what the admin may do with an act, by the order’s state', () => {
  const complete = [] as const;
  const lacking = ['mileage'] as const;

  it.each([
    // order status, act status, missing, [canEdit, canSend, canConfirmVerbal, canStartWork]
    ['confirmed', null, lacking, [true, false, false, false]],
    ['confirmed', 'draft', lacking, [true, false, false, false]],
    ['confirmed', 'draft', complete, [true, true, true, false]],
    ['confirmed', 'sent', complete, [true, false, true, false]],
    ['confirmed', 'confirmed', complete, [false, false, false, true]],
    ['new', 'draft', complete, [false, false, false, false]],
    ['in_work', 'confirmed', complete, [false, false, false, false]],
    ['cancelled', 'draft', complete, [false, false, false, false]],
  ] as const)('order %s, act %s, missing %j', (orderStatus, status, missing, expected) => {
    const actions = actActions({ orderStatus, status, missing });
    expect([
      actions.canEdit,
      actions.canSend,
      actions.canConfirmVerbal,
      actions.canStartWork,
    ]).toEqual(expected);
  });

  it('nothing but a confirmed order allows any of it', () => {
    for (const orderStatus of ORDER_STATUSES.filter((s) => s !== 'confirmed')) {
      for (const status of [null, ...ACT_STATUSES] as const) {
        const actions = actActions({ orderStatus, status, missing: [] });
        expect(Object.values(actions)).toEqual([false, false, false, false]);
      }
    }
  });
});

describe('the client’s answer', () => {
  it.each([
    ['confirmed', 'sent', true],
    ['confirmed', 'draft', false],
    ['confirmed', 'confirmed', false],
    ['confirmed', null, false],
    ['cancelled', 'sent', false],
    ['in_work', 'sent', false],
  ] as const)('order %s, act %s: %s', (orderStatus, status, expected) => {
    expect(canClientConfirm(orderStatus, status)).toBe(expected);
  });
});
