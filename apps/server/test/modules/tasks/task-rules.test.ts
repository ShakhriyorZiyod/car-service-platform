import { TASK_STATUSES } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import {
  adminTab,
  attemptOf,
  canAmend,
  canReassign,
  canSubmit,
  canTakePhotos,
  canTaskTransition,
  masterTab,
  normOf,
} from '../../../src/modules/tasks/domain/task-status';

describe('the task’s state machine (PLAN 9.2)', () => {
  const allowed = new Set([
    'assigned>assigned:admin',
    'in_progress>assigned:admin',
    'assigned>in_progress:master',
    'in_progress>on_review:master',
    'on_review>accepted:admin',
    'on_review>rework:admin',
    'rework>on_review:master',
  ]);
  const cases = TASK_STATUSES.flatMap((from) =>
    TASK_STATUSES.flatMap((to) =>
      (['admin', 'master'] as const).map((by) => ({
        from,
        to,
        by,
        ok: allowed.has(`${from}>${to}:${by}`),
      })),
    ),
  );

  it.each(cases)('$from → $to by $by: $ok', ({ from, to, by, ok }) => {
    expect(canTaskTransition(from, to, by)).toBe(ok);
  });

  it('an accepted task goes nowhere', () => {
    for (const to of TASK_STATUSES) {
      for (const by of ['admin', 'master'] as const) {
        expect(canTaskTransition('accepted', to, by)).toBe(false);
      }
    }
  });
});

describe('what may be done in each state', () => {
  it.each([
    ['assigned', false, true, true],
    ['in_progress', true, true, true],
    ['on_review', false, false, false],
    ['rework', true, false, true],
    ['accepted', false, false, false],
  ] as const)('%s: photos %s, reassign %s, amend %s', (status, photos, reassign, amend) => {
    expect(canTakePhotos(status)).toBe(photos);
    expect(canReassign(status)).toBe(reassign);
    expect(canAmend(status)).toBe(amend);
  });

  it('a report needs at least one photo of the work done, while the master is working', () => {
    expect(canSubmit('in_progress', 0)).toBe(false);
    expect(canSubmit('in_progress', 1)).toBe(true);
    expect(canSubmit('rework', 0)).toBe(false);
    expect(canSubmit('rework', 3)).toBe(true);
    expect(canSubmit('assigned', 5)).toBe(false);
    expect(canSubmit('on_review', 5)).toBe(false);
    expect(canSubmit('accepted', 5)).toBe(false);
  });

  it('each rework starts a new attempt', () => {
    expect([0, 1, 2, 5].map(attemptOf)).toEqual([1, 2, 3, 6]);
  });

  it('the norm is the zones’ norms added up', () => {
    expect(normOf([{ durationMin: 90 }, { durationMin: 135 }, { durationMin: 45 }])).toBe(270);
    expect(normOf([])).toBe(0);
  });
});

describe('the lists', () => {
  it.each([
    ['assigned', 'today', 'active'],
    ['in_progress', 'today', 'active'],
    ['rework', 'rework', 'active'],
    ['on_review', 'done', 'review'],
    ['accepted', 'done', 'done'],
  ] as const)('%s is on the master’s %s and the admin’s %s', (status, master, admin) => {
    expect(masterTab(status)).toBe(master);
    expect(adminTab(status)).toBe(admin);
  });
});
