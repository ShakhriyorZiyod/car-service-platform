import { describe, expect, it } from 'vitest';
import {
  addWorkMinutes,
  workIntervals,
  workMinutesBetween,
  type WorkCalendar,
} from '../../../src/modules/workshop/domain/working-time';

/**
 * Working time (docs/PLAN.md, section 10.1). The week below is the dev workshop's: Monday to
 * Friday 09:00–20:00 with a lunch break 13:00–14:00, Saturday 10:00–16:00 without a break, and
 * Sunday off. 2026-10-29 is a Thursday. All times are Tashkent (UTC+5).
 */

const WEEKDAY = { open: '09:00', close: '20:00', breakStart: '13:00', breakEnd: '14:00' };
const SATURDAY = { open: '10:00', close: '16:00', breakStart: null, breakEnd: null };

const calendar = (holidays: string[] = []): WorkCalendar => ({
  week: { 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKDAY, 6: SATURDAY },
  holidays: new Set(holidays),
});

/** "2026-10-29 10:00" in Tashkent → an instant. */
const at = (local: string): Date => new Date(`${local.replace(' ', 'T')}:00+05:00`);
/** An instant → "2026-10-29 10:00" in Tashkent, so failures read like the table. */
const shown = (instant: Date | null): string | null =>
  instant === null
    ? null
    : new Date(instant.getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

describe('working stretches of a date', () => {
  const stretches = (date: string, holidays: string[] = []) =>
    workIntervals(calendar(holidays), date).map(
      (interval) => `${shown(interval.start)?.slice(11)}–${shown(interval.end)?.slice(11)}`,
    );

  it.each([
    ['a weekday is split by the break', '2026-10-29', [], ['09:00–13:00', '14:00–20:00']],
    ['Saturday has no break', '2026-10-31', [], ['10:00–16:00']],
    ['Sunday is a day off', '2026-11-01', [], []],
    ['a holiday is a day off', '2026-10-30', ['2026-10-30'], []],
  ])('%s', (_name, date, holidays, expected) => {
    expect(stretches(date, holidays)).toEqual(expected);
  });

  it('a break that starts at opening leaves one stretch', () => {
    const early: WorkCalendar = {
      week: { 4: { open: '09:00', close: '18:00', breakStart: '09:00', breakEnd: '10:00' } },
      holidays: new Set(),
    };
    expect(workIntervals(early, '2026-10-29').map((interval) => shown(interval.start))).toEqual([
      '2026-10-29 10:00',
    ]);
  });
});

describe('adding working minutes', () => {
  it.each([
    ['within one stretch', '2026-10-29 10:00', 60, '2026-10-29 11:00'],
    ['across the break', '2026-10-29 12:30', 60, '2026-10-29 14:30'],
    ['ending exactly where the break begins', '2026-10-29 12:00', 60, '2026-10-29 13:00'],
    ['ending exactly at closing', '2026-10-29 18:00', 120, '2026-10-29 20:00'],
    ['past closing, into the next day', '2026-10-29 18:00', 150, '2026-10-30 09:30'],
    ['starting in the evening', '2026-10-29 19:00', 120, '2026-10-30 10:00'],
    ['starting during the break', '2026-10-29 13:30', 30, '2026-10-29 14:30'],
    ['starting after closing', '2026-10-29 21:00', 60, '2026-10-30 10:00'],
    ['starting exactly at closing', '2026-10-29 20:00', 30, '2026-10-30 09:30'],
    ['starting before opening', '2026-10-29 08:00', 30, '2026-10-29 09:30'],
    ['no minutes before opening: the opening itself', '2026-10-29 08:00', 0, '2026-10-29 09:00'],
    ['no minutes during working hours: the start', '2026-10-29 10:15', 0, '2026-10-29 10:15'],
    ['no minutes on a Sunday: Monday’s opening', '2026-11-01 12:00', 0, '2026-11-02 09:00'],
    ['to the end of Saturday', '2026-10-30 18:00', 480, '2026-10-31 16:00'],
    ['skipping Sunday', '2026-10-30 18:00', 481, '2026-11-02 09:01'],
    ['three working days and a morning', '2026-10-29 09:00', 1800, '2026-11-02 13:00'],
  ])('%s', (_name, start, minutes, expected) => {
    expect(shown(addWorkMinutes(calendar(), at(start), minutes))).toBe(expected);
  });

  it('skips a holiday', () => {
    // Friday 30 October is a holiday: the second hour of the job moves to Saturday morning.
    const result = addWorkMinutes(calendar(['2026-10-30']), at('2026-10-29 19:00'), 120);
    expect(shown(result)).toBe('2026-10-31 11:00');
  });

  it('keeps seconds of the start', () => {
    const result = addWorkMinutes(calendar(), new Date('2026-10-29T05:00:30Z'), 1);
    expect(result?.toISOString()).toBe('2026-10-29T05:01:30.000Z');
  });

  it('is null when there is no working time at all', () => {
    expect(
      addWorkMinutes({ week: {}, holidays: new Set() }, at('2026-10-29 10:00'), 60),
    ).toBeNull();
  });

  it.each([-1, 1.5, Number.NaN])('refuses %s minutes', (minutes) => {
    expect(() => addWorkMinutes(calendar(), at('2026-10-29 10:00'), minutes)).toThrow(RangeError);
  });
});

describe('counting working minutes between two instants', () => {
  it.each([
    ['inside one stretch', '2026-10-29 10:00', '2026-10-29 12:00', 120],
    ['across the break', '2026-10-29 12:00', '2026-10-29 15:00', 120],
    ['overnight', '2026-10-29 19:00', '2026-10-30 10:00', 120],
    ['over the weekend', '2026-10-30 19:00', '2026-11-02 10:00', 60 + 360 + 60],
    ['only outside working hours', '2026-10-29 20:30', '2026-10-30 08:30', 0],
    ['only the break', '2026-10-29 13:10', '2026-10-29 13:50', 0],
    ['an empty span', '2026-10-29 10:00', '2026-10-29 10:00', 0],
    ['a span turned around', '2026-10-29 12:00', '2026-10-29 10:00', 0],
  ])('%s', (_name, from, to, expected) => {
    expect(workMinutesBetween(calendar(), at(from), at(to))).toBe(expected);
  });

  it('does not count holidays', () => {
    const minutes = workMinutesBetween(
      calendar(['2026-10-30']),
      at('2026-10-29 19:00'),
      at('2026-10-31 11:00'),
    );
    expect(minutes).toBe(60 + 60);
  });

  it('counts whole minutes only', () => {
    const from = new Date('2026-10-29T05:00:00Z');
    expect(workMinutesBetween(calendar(), from, new Date('2026-10-29T05:00:59Z'))).toBe(0);
    expect(workMinutesBetween(calendar(), from, new Date('2026-10-29T05:01:30Z'))).toBe(1);
  });

  it('refuses spans too long to walk through', () => {
    expect(() =>
      workMinutesBetween(calendar(), at('2000-01-01 10:00'), at('2026-10-29 10:00')),
    ).toThrow(RangeError);
  });
});

describe('the two agree', () => {
  it.each([1, 59, 60, 240, 241, 600, 601, 1500, 4000])(
    'counting what %i minutes added gives %i minutes',
    (minutes) => {
      const start = at('2026-10-29 11:20');
      const end = addWorkMinutes(calendar(['2026-11-03']), start, minutes);
      expect(end).not.toBeNull();
      expect(workMinutesBetween(calendar(['2026-11-03']), start, end as Date)).toBe(minutes);
    },
  );
});
