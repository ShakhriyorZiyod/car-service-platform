import { describe, expect, it } from 'vitest';
import {
  availability,
  checkStart,
  daySlots,
  nearestFreeSlots,
  type BoxRef,
  type BusyStretch,
  type Planning,
} from '../../../src/modules/booking/domain/slots';
import {
  createWorkTime,
  type WorkCalendar,
} from '../../../src/modules/workshop/domain/working-time';

/**
 * Free times (docs/PLAN.md, sections 10.2–10.3). The week is the dev workshop's: Monday to Friday
 * 09:00–20:00 with a break 13:00–14:00, Saturday 10:00–16:00, Sunday off. 2026-10-29 is a Thursday.
 * All times are Tashkent (UTC+5).
 */

const WEEKDAY = { open: '09:00', close: '20:00', breakStart: '13:00', breakEnd: '14:00' };
const SATURDAY = { open: '10:00', close: '16:00', breakStart: null, breakEnd: null };

const calendar = (holidays: string[] = []): WorkCalendar => ({
  week: { 1: WEEKDAY, 2: WEEKDAY, 3: WEEKDAY, 4: WEEKDAY, 5: WEEKDAY, 6: SATURDAY },
  holidays: new Set(holidays),
});

const at = (local: string): Date => new Date(`${local.replace(' ', 'T')}:00+05:00`);
const hhmm = (instant: Date): string =>
  new Date(instant.getTime() + 5 * 3_600_000).toISOString().slice(11, 16);
const stamp = (instant: Date): string =>
  new Date(instant.getTime() + 5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

const BOX_1: BoxRef = { id: 'box-1', name: '1-boks' };
const BOX_2: BoxRef = { id: 'box-2', name: '2-boks' };

function planning(overrides: {
  now?: string;
  workMinutes?: number;
  boxes?: BoxRef[];
  busy?: BusyStretch[];
  holidays?: string[];
  step?: number;
  lead?: number;
  horizon?: number;
}): Planning {
  return {
    now: at(overrides.now ?? '2026-10-29 10:00'),
    rules: {
      slotStepMin: overrides.step ?? 30,
      minLeadMin: overrides.lead ?? 120,
      horizonDays: overrides.horizon ?? 30,
    },
    time: createWorkTime(calendar(overrides.holidays)),
    boxes: overrides.boxes ?? [BOX_1],
    busy: overrides.busy ?? [],
    job: { workMinutes: overrides.workMinutes ?? 60 },
  };
}

const busy = (box: BoxRef, from: string, to: string): BusyStretch => ({
  boxId: box.id,
  startsAt: at(from),
  endsAt: at(to),
});

const starts = (date: string, p: Planning) => daySlots(date, p).map((slot) => hhmm(slot.startsAt));
const freeStarts = (date: string, p: Planning) =>
  daySlots(date, p)
    .filter((slot) => slot.free)
    .map((slot) => hhmm(slot.startsAt));

describe('start times of a day', () => {
  it('every step from opening, not in the break, done before closing; a job may cross the break', () => {
    const times = starts('2026-10-30', planning({ workMinutes: 60 }));
    expect(times.slice(0, 9)).toEqual([
      '09:00',
      '09:30',
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '14:00',
    ]);
    // 12:30 + 60 working minutes ends at 14:30, across the break; 13:00 and 13:30 are in it.
    expect(times).not.toContain('13:00');
    expect(times).not.toContain('13:30');
    expect(times.at(-1)).toBe('19:00');
  });

  it.each([
    ['one hour', 60, '19:00'],
    ['two hours', 120, '18:00'],
    ['a job that fills the rest of the day exactly', 360, '14:00'],
  ])('the last start for %s is %s', (_name, workMinutes, last) => {
    expect(starts('2026-10-30', planning({ workMinutes })).at(-1)).toBe(last);
  });

  it('the end of the job skips the break', () => {
    const slot = daySlots('2026-10-30', planning({ workMinutes: 120 })).find(
      (candidate) => hhmm(candidate.startsAt) === '12:00',
    );
    expect(stamp(slot!.endsAt)).toBe('2026-10-30 15:00');
  });

  it('a different step gives different starts', () => {
    expect(starts('2026-10-30', planning({ workMinutes: 60, step: 60 })).slice(0, 4)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
    ]);
  });

  it('a job that exactly fills a working day starts only at opening', () => {
    expect(starts('2026-10-30', planning({ workMinutes: 600 }))).toEqual(['09:00']);
  });

  it('a job longer than a day starts only at opening and runs over the following days', () => {
    const slots = daySlots('2026-10-30', planning({ workMinutes: 601 }));
    expect(slots).toHaveLength(1);
    expect(stamp(slots[0]!.startsAt)).toBe('2026-10-30 09:00');
    // Friday 600, Saturday opens 10:00: the last minute is at 10:01.
    expect(stamp(slots[0]!.endsAt)).toBe('2026-10-31 10:01');
  });

  it('a multi-day job skips Sunday and holidays', () => {
    const slots = daySlots('2026-10-31', planning({ workMinutes: 400 }));
    // Saturday gives 360 minutes (10:00–16:00), Sunday none, Monday 09:00 gives the last 40.
    expect(stamp(slots[0]!.endsAt)).toBe('2026-11-02 09:40');
    const withHoliday = daySlots(
      '2026-10-31',
      planning({ workMinutes: 400, holidays: ['2026-11-02'] }),
    );
    expect(stamp(withHoliday[0]!.endsAt)).toBe('2026-11-03 09:40');
  });

  it('Saturday is shorter: a job too long for it becomes a multi-day one', () => {
    expect(starts('2026-10-31', planning({ workMinutes: 300 })).at(-1)).toBe('11:00');
    expect(starts('2026-10-31', planning({ workMinutes: 361 }))).toEqual(['10:00']);
  });

  it('a day off and a holiday have no start times', () => {
    expect(starts('2026-11-01', planning({}))).toEqual([]);
    expect(starts('2026-10-30', planning({ holidays: ['2026-10-30'] }))).toEqual([]);
  });
});

describe('what is free', () => {
  it('nothing sooner than the lead time; the moment the lead ends is free', () => {
    // Now is Thursday 10:00, lead two hours: 12:00 is the first free start today.
    const today = daySlots('2026-10-29', planning({ workMinutes: 60 }));
    expect(today.find((slot) => hhmm(slot.startsAt) === '11:30')?.free).toBe(false);
    expect(today.find((slot) => hhmm(slot.startsAt) === '12:00')?.free).toBe(true);
    expect(freeStarts('2026-10-29', planning({ workMinutes: 60 }))[0]).toBe('12:00');
  });

  it('a start that is not free is still listed, with no box', () => {
    const slot = daySlots('2026-10-29', planning({}))[0]!;
    expect(hhmm(slot.startsAt)).toBe('09:00');
    expect(slot).toMatchObject({ free: false, box: null });
  });

  it('the first box that is free is the one offered; the second when the first is busy', () => {
    const open = daySlots('2026-10-30', planning({ boxes: [BOX_1, BOX_2] }));
    expect(open[0]?.box).toEqual(BOX_1);

    const held = planning({
      boxes: [BOX_1, BOX_2],
      busy: [busy(BOX_1, '2026-10-30 09:00', '2026-10-30 10:00')],
    });
    const slot = daySlots('2026-10-30', held)[0]!;
    expect(slot).toMatchObject({ free: true, box: BOX_2 });
  });

  it('when every box is busy the start is not free', () => {
    const p = planning({
      boxes: [BOX_1, BOX_2],
      busy: [
        busy(BOX_1, '2026-10-30 09:00', '2026-10-30 10:00'),
        busy(BOX_2, '2026-10-30 09:30', '2026-10-30 10:30'),
      ],
    });
    // 10:00 is free again in the first box, which is only held until 10:00.
    expect(freeStarts('2026-10-30', p).slice(0, 2)).toEqual(['10:00', '10:30']);
    expect(daySlots('2026-10-30', p)[0]).toMatchObject({ free: false, box: null });
  });

  it('stretches that only touch do not block: a job ends where the next begins', () => {
    const p = planning({
      busy: [busy(BOX_1, '2026-10-30 09:00', '2026-10-30 10:00')],
    });
    // 10:00 starts exactly where the booking ends, and 08:00 would end exactly where it starts.
    expect(freeStarts('2026-10-30', p).slice(0, 2)).toEqual(['10:00', '10:30']);
    const before = planning({
      busy: [busy(BOX_1, '2026-10-30 10:00', '2026-10-30 11:00')],
    });
    expect(freeStarts('2026-10-30', before).slice(0, 2)).toEqual(['09:00', '11:00']);
  });

  it('a boxes’s overnight multi-day booking blocks the starts it overlaps', () => {
    const p = planning({
      busy: [busy(BOX_1, '2026-10-30 18:00', '2026-11-02 12:00')],
    });
    expect(freeStarts('2026-10-30', p)).not.toContain('18:00');
    expect(freeStarts('2026-10-30', p)).toContain('09:00');
    expect(freeStarts('2026-10-31', p)).toEqual([]);
  });

  it('a booking in another box does not matter', () => {
    const p = planning({
      boxes: [BOX_1],
      busy: [busy(BOX_2, '2026-10-30 09:00', '2026-10-30 20:00')],
    });
    expect(freeStarts('2026-10-30', p)[0]).toBe('09:00');
  });
});

describe('the days a client may pick', () => {
  it('starts today and runs for the horizon, each day free, full or closed', () => {
    const days = availability(planning({ horizon: 7 }));
    expect(days.map((day) => day.date)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ]);
    expect(days.map((day) => day.state)).toEqual([
      'free',
      'free',
      'free',
      'closed',
      'free',
      'free',
      'free',
    ]);
    expect(days[3]).toMatchObject({ closedReason: 'day_off' });
  });

  it('a holiday is closed for that reason', () => {
    const days = availability(planning({ horizon: 3, holidays: ['2026-10-30'] }));
    expect(days[1]).toEqual({ date: '2026-10-30', state: 'closed', closedReason: 'holiday' });
  });

  it('a day with every start taken is full', () => {
    const p = planning({
      busy: [busy(BOX_1, '2026-10-30 09:00', '2026-10-30 20:00')],
      horizon: 3,
    });
    expect(availability(p)[1]?.state).toBe('full');
  });

  it('today after the lead time has run out is full', () => {
    const late = planning({ now: '2026-10-29 19:00', horizon: 2 });
    expect(availability(late)[0]?.state).toBe('full');
  });

  it('nearest free times: the next three, running on to the following days', () => {
    const p = planning({
      busy: [busy(BOX_1, '2026-10-30 09:00', '2026-10-30 19:00')],
      horizon: 5,
    });
    const nearest = nearestFreeSlots('2026-10-30', 3, p);
    expect(nearest.map((slot) => stamp(slot.startsAt))).toEqual([
      '2026-10-30 19:00',
      '2026-10-31 10:00',
      '2026-10-31 10:30',
    ]);
  });

  it('nearest free times: fewer when there are fewer in the horizon', () => {
    const p = planning({ horizon: 1, now: '2026-10-29 17:30', workMinutes: 60 });
    expect(nearestFreeSlots('2026-10-29', 3, p)).toHaveLength(0);
  });
});

describe('a start time the client sends', () => {
  const p = planning({ workMinutes: 120 });

  it('an offered start is accepted with its end', () => {
    expect(checkStart(at('2026-10-30 12:00'), p)).toEqual({
      ok: true,
      endsAt: at('2026-10-30 15:00'),
    });
  });

  it.each([
    ['off the step grid', '2026-10-30 10:10', 'not_a_slot'],
    ['inside the break', '2026-10-30 13:00', 'not_a_slot'],
    ['too late to finish before closing', '2026-10-30 18:30', 'not_a_slot'],
    ['before opening', '2026-10-30 08:00', 'not_a_slot'],
    ['on a day off', '2026-11-01 10:00', 'not_a_slot'],
    ['sooner than the lead time', '2026-10-29 11:00', 'too_soon'],
    ['in the past', '2026-10-28 10:00', 'outside_horizon'],
    ['beyond the horizon', '2026-12-30 10:00', 'outside_horizon'],
  ])('%s is refused', (_name, start, problem) => {
    expect(checkStart(at(start), p)).toEqual({ ok: false, problem });
  });

  it('who else is booked does not matter here: that is the database’s to say', () => {
    const busyP = planning({
      workMinutes: 120,
      busy: [busy(BOX_1, '2026-10-30 09:00', '2026-10-30 20:00')],
    });
    expect(checkStart(at('2026-10-30 12:00'), busyP).ok).toBe(true);
  });
});
