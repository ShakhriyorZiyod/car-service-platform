import { ORDER_STATUSES } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import {
  callOverdue,
  reminderDue,
  reminderKey,
} from '../../../src/modules/orders/domain/followups';
import { noShowAllowed, staffActions } from '../../../src/modules/orders/domain/staff-actions';

const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+05:00`);

describe('what the staff may do with an order (PLAN 9.1, 10.4)', () => {
  const now = at('2026-10-29 12:00');
  const later = at('2026-10-29 15:00');

  it.each([
    [
      'new',
      { canCall: true, canEditItems: true, canReschedule: true, canCancel: true, canNoShow: false },
    ],
    [
      'confirmed',
      {
        canCall: false,
        canEditItems: true,
        canReschedule: true,
        canCancel: true,
        canNoShow: false,
      },
    ],
    [
      'in_work',
      {
        canCall: false,
        canEditItems: false,
        canReschedule: false,
        canCancel: false,
        canNoShow: false,
      },
    ],
    [
      'ready_for_pickup',
      {
        canCall: false,
        canEditItems: false,
        canReschedule: false,
        canCancel: false,
        canNoShow: false,
      },
    ],
    [
      'completed',
      {
        canCall: false,
        canEditItems: false,
        canReschedule: false,
        canCancel: false,
        canNoShow: false,
      },
    ],
    [
      'cancelled',
      {
        canCall: false,
        canEditItems: false,
        canReschedule: false,
        canCancel: false,
        canNoShow: false,
      },
    ],
    [
      'no_show',
      {
        canCall: false,
        canEditItems: false,
        canReschedule: false,
        canCancel: false,
        canNoShow: false,
      },
    ],
  ] as const)('an admin with a %s order', (status, expected) => {
    expect(staffActions({ status, startsAt: later, now, by: 'admin' })).toEqual(expected);
  });

  it('only the owner cancels work in progress', () => {
    expect(staffActions({ status: 'in_work', startsAt: later, now, by: 'owner' }).canCancel).toBe(
      true,
    );
    expect(staffActions({ status: 'in_work', startsAt: later, now, by: 'admin' }).canCancel).toBe(
      false,
    );
  });

  it('every status is covered', () => {
    for (const status of ORDER_STATUSES) {
      expect(() => staffActions({ status, startsAt: later, now, by: 'admin' })).not.toThrow();
    }
  });

  describe('"no show" (design A1)', () => {
    it.each([
      ['before the slot begins', '2026-10-29 11:59', false],
      ['the moment it begins', '2026-10-29 12:00', true],
      ['after it began', '2026-10-29 18:00', true],
    ])('a confirmed order %s', (_name, nowLocal, expected) => {
      expect(noShowAllowed('confirmed', at('2026-10-29 12:00'), at(nowLocal))).toBe(expected);
    });

    it.each(['new', 'in_work', 'ready_for_pickup', 'completed', 'cancelled', 'no_show'] as const)(
      'never for an order that is %s',
      (status) => {
        expect(noShowAllowed(status, at('2026-10-29 12:00'), at('2026-10-30 12:00'))).toBe(false);
      },
    );
  });
});

describe('reminders (PLAN 12)', () => {
  const visit = at('2026-10-30 12:00');
  const order = (overrides: object = {}) => ({
    status: 'confirmed' as const,
    confirmedAt: at('2026-10-28 10:00'),
    startsAt: visit,
    remindersEnabled: true,
    ...overrides,
  });

  it.each([
    ['before the window begins', '2026-10-29 11:59', 24, false],
    ['the moment the 24-hour window begins', '2026-10-29 12:00', 24, true],
    ['inside the window', '2026-10-30 08:00', 24, true],
    ['the 2-hour window, not yet', '2026-10-30 09:59', 2, false],
    ['the 2-hour window begins', '2026-10-30 10:00', 2, true],
    ['the visit has begun', '2026-10-30 12:00', 2, false],
    ['the visit is past', '2026-10-30 15:00', 24, false],
  ])('%s', (_name, nowLocal, hours, expected) => {
    expect(reminderDue(order(), hours, at(nowLocal))).toBe(expected);
  });

  it('confirmed inside the window: the 24-hour reminder is skipped, the 2-hour one still goes', () => {
    // Called and confirmed the evening before: 18 hours to the visit.
    const lateConfirmed = order({ confirmedAt: at('2026-10-29 18:00') });
    expect(reminderDue(lateConfirmed, 24, at('2026-10-30 08:00'))).toBe(false);
    expect(reminderDue(lateConfirmed, 2, at('2026-10-30 10:00'))).toBe(true);
  });

  it('confirmed exactly when the window begins counts as before it', () => {
    const edge = order({ confirmedAt: at('2026-10-29 12:00') });
    expect(reminderDue(edge, 24, at('2026-10-29 12:00'))).toBe(true);
  });

  it('not when the client switched reminders off', () => {
    expect(reminderDue(order({ remindersEnabled: false }), 24, at('2026-10-30 08:00'))).toBe(false);
  });

  it.each(['new', 'in_work', 'ready_for_pickup', 'completed', 'cancelled', 'no_show'] as const)(
    'not for an order that is %s',
    (status) => {
      expect(reminderDue(order({ status }), 24, at('2026-10-30 08:00'))).toBe(false);
    },
  );

  it('not for an order that was never confirmed', () => {
    expect(reminderDue(order({ confirmedAt: null }), 24, at('2026-10-30 08:00'))).toBe(false);
  });

  it('the key names the order, the hours and the time, so a moved order is reminded again', () => {
    const first = reminderKey('o1', 24, visit);
    expect(first).toBe(reminderKey('o1', 24, visit));
    expect(first).not.toBe(reminderKey('o1', 2, visit));
    expect(first).not.toBe(reminderKey('o1', 24, at('2026-10-31 12:00')));
    expect(first).not.toBe(reminderKey('o2', 24, visit));
  });
});

describe('an order nobody called about (PLAN 4.8)', () => {
  const base = { status: 'new' as const, calls: 0, waitingWorkMin: 30, thresholdMin: 30 };

  it('is overdue from the threshold on, never before', () => {
    expect(callOverdue({ ...base, waitingWorkMin: 29 })).toBe(false);
    expect(callOverdue(base)).toBe(true);
    expect(callOverdue({ ...base, waitingWorkMin: 300 })).toBe(true);
  });

  it('a call of any outcome, or any other status, ends it', () => {
    expect(callOverdue({ ...base, calls: 1 })).toBe(false);
    for (const status of ORDER_STATUSES.filter((s) => s !== 'new')) {
      expect(callOverdue({ ...base, status })).toBe(false);
    }
  });
});
