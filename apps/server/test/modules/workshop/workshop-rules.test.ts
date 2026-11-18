import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  normalizeReminderHours,
  readSettings,
} from '../../../src/modules/workshop/domain/settings';
import {
  weekOf,
  workWeekProblems,
  type WorkDayEntry,
} from '../../../src/modules/workshop/domain/work-week';

const day = (overrides: Partial<WorkDayEntry> = {}): WorkDayEntry => ({
  weekday: 1,
  open: '09:00',
  close: '20:00',
  breakStart: '13:00',
  breakEnd: '14:00',
  ...overrides,
});

describe('the working week the owner enters (PLAN 7.4)', () => {
  it('a normal week has no problems', () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => day({ weekday }));
    expect(
      workWeekProblems([...week, day({ weekday: 6, breakStart: null, breakEnd: null })]),
    ).toEqual([]);
    expect(workWeekProblems([])).toEqual([]);
  });

  it.each<[string, Partial<WorkDayEntry>, string]>([
    ['closing not after opening', { close: '09:00' }, 'close_not_after_open'],
    ['closing before opening', { close: '08:00' }, 'close_not_after_open'],
    ['a break with no end', { breakEnd: null }, 'break_incomplete'],
    ['a break with no start', { breakStart: null }, 'break_incomplete'],
    ['a break that starts before opening', { breakStart: '08:00' }, 'break_outside_hours'],
    ['a break that ends after closing', { breakEnd: '21:00' }, 'break_outside_hours'],
    ['a break that ends where it starts', { breakEnd: '13:00' }, 'break_outside_hours'],
    [
      'a break that ends before it starts',
      { breakStart: '14:00', breakEnd: '13:00' },
      'break_outside_hours',
    ],
    ['weekday 0', { weekday: 0 }, 'weekday_invalid'],
    ['weekday 8', { weekday: 8 }, 'weekday_invalid'],
  ])('%s is refused', (_name, overrides, problem) => {
    expect(workWeekProblems([day(overrides)])).toEqual([{ index: 0, problem }]);
  });

  it('a break may touch opening and closing', () => {
    expect(workWeekProblems([day({ breakStart: '09:00', breakEnd: '10:00' })])).toEqual([]);
    expect(workWeekProblems([day({ breakStart: '19:00', breakEnd: '20:00' })])).toEqual([]);
  });

  it('a weekday cannot appear twice, and every wrong entry is named', () => {
    expect(
      workWeekProblems([
        day({ weekday: 2 }),
        day({ weekday: 2 }),
        day({ weekday: 3, close: '08:00' }),
      ]),
    ).toEqual([
      { index: 1, problem: 'weekday_repeated' },
      { index: 2, problem: 'close_not_after_open' },
    ]);
  });

  it('becomes the calendar’s week by weekday', () => {
    const week = weekOf([
      day({ weekday: 2 }),
      day({ weekday: 6, breakStart: null, breakEnd: null }),
    ]);
    expect(Object.keys(week)).toEqual(['2', '6']);
    expect(week[6]).toEqual({ open: '09:00', close: '20:00', breakStart: null, breakEnd: null });
  });
});

describe('settings (PLAN 7.4)', () => {
  it('nothing saved yet: the defaults', () => {
    expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('what is saved wins and what is missing is filled in, so a new setting needs no migration', () => {
    const settings = readSettings({
      workshop: { name: 'Avto Pro' },
      rules: { slotStepMin: 15 },
    });
    expect(settings.workshop).toEqual({ ...DEFAULT_SETTINGS.workshop, name: 'Avto Pro' });
    expect(settings.rules).toEqual({ ...DEFAULT_SETTINGS.rules, slotStepMin: 15 });
  });

  it('drops what the schema does not know', () => {
    const settings = readSettings({ workshop: { name: 'Avto Pro', color: 'red' }, other: 1 });
    expect(settings).not.toHaveProperty('other');
    expect(settings.workshop).not.toHaveProperty('color');
  });

  it('a stored value that no longer fits fails loudly', () => {
    expect(() => readSettings({ rules: { slotStepMin: 0 } })).toThrow();
    expect(() => readSettings({ rules: { callWarnMin: 40, callEscalateMin: 30 } })).toThrow();
  });

  it('the defaults are the plan’s numbers', () => {
    expect(DEFAULT_SETTINGS.rules).toEqual({
      slotStepMin: 30,
      minLeadMin: 120,
      horizonDays: 30,
      bufferMin: 15,
      holdNewWorkMin: 120,
      holdNoAnswerHours: 24,
      callWarnMin: 15,
      callEscalateMin: 30,
      reminderHours: [24, 2],
      adminDiscountLimitPct: 5,
    });
  });

  it.each([
    [
      [2, 24],
      [24, 2],
    ],
    [
      [24, 24, 2],
      [24, 2],
    ],
    [[], []],
    [[1], [1]],
  ])('reminder hours %j are kept as %j: earliest first, each once', (given, expected) => {
    expect(normalizeReminderHours(given)).toEqual(expected);
  });
});
