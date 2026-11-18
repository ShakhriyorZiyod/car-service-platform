import { describe, expect, it } from 'vitest';
import { addDays, instantAt, localDateOf, localTimeOf, weekdayOf } from '../../src/lib/time';

/** Tashkent is UTC+5: local midnight is 19:00 UTC of the day before. */
describe('the workshop’s calendar is Asia/Tashkent, whatever the server’s zone', () => {
  it.each([
    ['2026-10-28T18:59:59.999Z', '2026-10-28', '23:59'],
    ['2026-10-28T19:00:00.000Z', '2026-10-29', '00:00'],
    ['2026-10-29T05:00:00.000Z', '2026-10-29', '10:00'],
    ['2026-12-31T19:30:00.000Z', '2027-01-01', '00:30'],
  ])('%s is %s %s in Tashkent', (iso, date, time) => {
    const instant = new Date(iso);
    expect(localDateOf(instant)).toBe(date);
    expect(localTimeOf(instant)).toBe(time);
  });

  it.each([
    ['2026-10-29', '10:00', '2026-10-29T05:00:00.000Z'],
    ['2026-10-29', '00:00', '2026-10-28T19:00:00.000Z'],
    // European and American clock changes do not move Tashkent.
    ['2026-03-29', '10:00', '2026-03-29T05:00:00.000Z'],
    ['2026-07-01', '10:00', '2026-07-01T05:00:00.000Z'],
    ['2026-11-01', '10:00', '2026-11-01T05:00:00.000Z'],
  ])('%s %s in Tashkent is %s', (date, time, iso) => {
    expect(instantAt(date, time).toISOString()).toBe(iso);
  });

  it('a local date and time survive the round trip through an instant', () => {
    const instant = instantAt('2026-10-29', '14:30');
    expect([localDateOf(instant), localTimeOf(instant)]).toEqual(['2026-10-29', '14:30']);
  });

  it.each([
    ['2026-02-30', '10:00'],
    // ISO reads "24:00" as the next day's midnight; a slot or a closing time must not.
    ['2026-10-29', '24:00'],
    ['2026-10-29', '10:60'],
    ['2026-10-29', '9:00'],
    ['2026-10-29', '10:00:00'],
    ['29.10.2026', '10:00'],
    // Other ISO date forms Luxon would accept: a week date and an ordinal date.
    ['2026-W44-4', '10:00'],
    ['2026-302', '10:00'],
  ])('rejects %s %s', (date, time) => {
    expect(() => instantAt(date, time)).toThrow(RangeError);
  });

  it.each(['2026-02-30', '2026-W44-4', '2026-10-29T10:00', ''])(
    'weekdayOf and addDays reject %j',
    (date) => {
      expect(() => weekdayOf(date)).toThrow(RangeError);
      expect(() => addDays(date, 1)).toThrow(RangeError);
    },
  );
});

describe('weekdayOf: 1 = Monday … 7 = Sunday', () => {
  it.each([
    // The design's examples: "29-oktabr, payshanba", "Yakshanba, 1-noyabr", "Dushanba, 2-noyabr".
    ['2026-10-29', 4],
    ['2026-11-01', 7],
    ['2026-11-02', 1],
  ])('%s is weekday %s', (date, weekday) => {
    expect(weekdayOf(date)).toBe(weekday);
  });
});

describe('addDays: calendar days', () => {
  it.each([
    ['2026-10-29', 1, '2026-10-30'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-11-01', -1, '2026-10-31'],
    ['2026-10-29', 30, '2026-11-28'],
  ])('%s + %s = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
