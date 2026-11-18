import { ORDER_STATUSES } from '@cs/shared/vocabulary';
import { describe, expect, it } from 'vitest';
import { holdAfterNoAnswer, holdExpired, holdUntil } from '../../../src/modules/orders/domain/hold';
import {
  canTransition,
  clientActions,
  ORDER_TRANSITIONS,
  type OrderActor,
} from '../../../src/modules/orders/domain/order-status';
import {
  buildQuote,
  serviceTypesOf,
  type ZoneOffer,
} from '../../../src/modules/orders/domain/quote';
import { createWorkTime } from '../../../src/modules/workshop/domain/working-time';

const ACTORS: OrderActor[] = ['client', 'admin', 'owner', 'system'];

describe('the order’s status changes (PLAN 9.1)', () => {
  const allowed = new Set(
    ORDER_TRANSITIONS.flatMap((t) => t.by.map((by) => `${t.from}>${t.to}>${by}`)),
  );

  const matrix = ORDER_STATUSES.flatMap((from) =>
    ORDER_STATUSES.flatMap((to) => ACTORS.map((by) => [from, to, by] as const)),
  );

  it.each(matrix)('%s → %s by %s', (from, to, by) => {
    expect(canTransition(from, to, by)).toBe(allowed.has(`${from}>${to}>${by}`));
  });

  it.each([
    ['new', 'confirmed', 'admin'],
    ['new', 'cancelled', 'client'],
    ['new', 'cancelled', 'system'],
    ['confirmed', 'cancelled', 'client'],
    ['confirmed', 'no_show', 'admin'],
    ['confirmed', 'in_work', 'admin'],
    ['in_work', 'ready_for_pickup', 'system'],
    ['in_work', 'cancelled', 'owner'],
    ['ready_for_pickup', 'completed', 'admin'],
  ] as const)('%s → %s by %s is allowed', (from, to, by) => {
    expect(canTransition(from, to, by)).toBe(true);
  });

  it.each([
    ['a finished order cannot be cancelled', 'completed', 'cancelled', 'owner'],
    ['a cancelled order cannot be revived', 'cancelled', 'new', 'owner'],
    ['the client cannot cancel work in progress', 'in_work', 'cancelled', 'client'],
    ['the admin cannot cancel work in progress, only the owner', 'in_work', 'cancelled', 'admin'],
    ['the client cannot confirm their own order', 'new', 'confirmed', 'client'],
    ['nothing skips a step', 'new', 'in_work', 'admin'],
    ['"no show" only comes from confirmed', 'new', 'no_show', 'admin'],
  ] as const)('%s', (_name, from, to, by) => {
    expect(canTransition(from, to, by)).toBe(false);
  });

  it('what the client may do is decided by the status, once for rescheduling', () => {
    expect(clientActions({ status: 'new', rescheduleRequested: false })).toEqual({
      canCancel: true,
      canRequestReschedule: true,
    });
    expect(clientActions({ status: 'confirmed', rescheduleRequested: true })).toEqual({
      canCancel: true,
      canRequestReschedule: false,
    });
    for (const status of [
      'in_work',
      'ready_for_pickup',
      'completed',
      'cancelled',
      'no_show',
    ] as const) {
      expect(clientActions({ status, rescheduleRequested: false })).toEqual({
        canCancel: false,
        canRequestReschedule: false,
      });
    }
  });
});

const zone = (id: string, overrides: Partial<ZoneOffer> = {}): ZoneOffer => ({
  serviceId: id,
  serviceTypeId: 'ceramic',
  nameUz: `Zona ${id}`,
  nameRu: `Зона ${id}`,
  typeNameUz: 'Keramika',
  typeNameRu: 'Керамика',
  isActive: true,
  excludes: [],
  cell: { price: 1_000_000, durationMin: 120 },
  ...overrides,
});

const OPTIONS = { bufferMin: 15, longestWorkdayMin: 600 };

describe('price and time of the chosen zones (PLAN 10.2, 11)', () => {
  it('adds up prices and minutes, and the buffer makes the time a box is held', () => {
    const result = buildQuote(
      ['bonnet', 'bumper'],
      [
        zone('bonnet', { cell: { price: 1_400_000, durationMin: 120 } }),
        zone('bumper', { cell: { price: 1_600_000, durationMin: 150 } }),
      ],
      OPTIONS,
    );
    expect(result).toMatchObject({
      ok: true,
      quote: {
        subtotal: 3_000_000,
        unpricedCount: 0,
        workMinutes: 270,
        bufferMin: 15,
        totalMinutes: 285,
        multiDay: false,
      },
    });
  });

  it('a zone with no price ("to be agreed") is counted apart and is not in the total', () => {
    const result = buildQuote(
      ['bonnet', 'other'],
      [zone('bonnet'), zone('other', { cell: { price: null, durationMin: 60 } })],
      OPTIONS,
    );
    expect(result).toMatchObject({
      ok: true,
      quote: { subtotal: 1_000_000, unpricedCount: 1, workMinutes: 180 },
    });
  });

  it('keeps the names and the kind of work, to be copied into the order', () => {
    const result = buildQuote(['bonnet'], [zone('bonnet')], OPTIONS);
    expect(result.ok && result.quote.lines[0]).toMatchObject({
      serviceId: 'bonnet',
      nameUz: 'Zona bonnet',
      typeNameRu: 'Керамика',
      price: 1_000_000,
      durationMin: 120,
    });
  });

  it('more than the longest working day is a multi-day job; exactly a day is not', () => {
    const long = (minutes: number) =>
      buildQuote(['full'], [zone('full', { cell: { price: 1, durationMin: minutes } })], OPTIONS);
    expect(long(585)).toMatchObject({ ok: true, quote: { totalMinutes: 600, multiDay: false } });
    expect(long(586)).toMatchObject({ ok: true, quote: { totalMinutes: 601, multiDay: true } });
  });

  it('the same zone twice is counted once', () => {
    const result = buildQuote(['bonnet', 'bonnet'], [zone('bonnet')], OPTIONS);
    expect(result).toMatchObject({ ok: true, quote: { subtotal: 1_000_000 } });
  });

  it('"whole body" and a panel it covers cannot be chosen together', () => {
    const offers = [
      zone('full', { excludes: ['bonnet', 'bumper'] }),
      zone('bonnet'),
      zone('bumper'),
    ];
    expect(buildQuote(['full', 'bonnet'], offers, OPTIONS)).toEqual({
      ok: false,
      problem: 'zones_exclude_each_other',
      serviceId: 'bonnet',
    });
    expect(buildQuote(['full'], offers, OPTIONS).ok).toBe(true);
    expect(buildQuote(['bonnet', 'bumper'], offers, OPTIONS).ok).toBe(true);
  });

  it.each([
    ['nothing chosen', [], [zone('bonnet')], 'nothing_chosen', undefined],
    ['a zone that does not exist', ['ghost'], [zone('bonnet')], 'unknown_zone', 'ghost'],
    [
      'a zone that is hidden',
      ['bonnet'],
      [zone('bonnet', { isActive: false })],
      'zone_not_in_use',
      'bonnet',
    ],
    [
      'a zone not offered for this class',
      ['bonnet'],
      [zone('bonnet', { cell: null })],
      'not_offered_for_class',
      'bonnet',
    ],
  ])('%s is refused', (_name, chosen, offers, problem, serviceId) => {
    expect(buildQuote(chosen, offers, OPTIONS)).toEqual({
      ok: false,
      problem,
      ...(serviceId && { serviceId }),
    });
  });

  it('the kinds of work of an order, once each', () => {
    const result = buildQuote(
      ['a', 'b', 'c'],
      [zone('a'), zone('b'), zone('c', { serviceTypeId: 'wash' })],
      OPTIONS,
    );
    expect(result.ok && serviceTypesOf(result.quote).sort()).toEqual(['ceramic', 'wash']);
  });
});

describe('holding a new order’s slot (PLAN 10.4)', () => {
  // Monday to Friday 09:00–20:00, no break, for the hold arithmetic. 2026-10-29 is a Thursday.
  const week = { open: '09:00', close: '20:00', breakStart: null, breakEnd: null };
  const time = createWorkTime({
    week: { 1: week, 2: week, 3: week, 4: week, 5: week },
    holidays: new Set(),
  });
  const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+05:00`);

  it('a request in working hours is held for the working minutes after it', () => {
    expect(holdUntil(time, at('2026-10-29 10:00'), 120)).toEqual(at('2026-10-29 12:00'));
  });

  it('a request at night is held from the morning, so it is not cancelled before the admin comes', () => {
    expect(holdUntil(time, at('2026-10-29 23:00'), 120)).toEqual(at('2026-10-30 11:00'));
  });

  it('a request on Friday evening runs into Monday', () => {
    expect(holdUntil(time, at('2026-10-30 19:00'), 120)).toEqual(at('2026-11-02 10:00'));
  });

  it('"no answer" stretches the hold and never shortens it', () => {
    const now = at('2026-10-29 12:00');
    expect(holdAfterNoAnswer(at('2026-10-29 12:00'), now, 24)).toEqual(at('2026-10-30 12:00'));
    expect(holdAfterNoAnswer(at('2026-11-05 12:00'), now, 24)).toEqual(at('2026-11-05 12:00'));
    expect(holdAfterNoAnswer(null, now, 24)).toEqual(at('2026-10-30 12:00'));
  });

  describe('when it runs out', () => {
    const order = (overrides: object = {}) => ({
      status: 'new' as const,
      holdUntil: at('2026-10-29 12:00'),
      startsAt: at('2026-10-30 10:00'),
      ...overrides,
    });

    it('a new order past its hold is cancelled, the moment the hold ends included', () => {
      expect(holdExpired(order(), at('2026-10-29 12:00'))).toBe(true);
      expect(holdExpired(order(), at('2026-10-29 12:01'))).toBe(true);
      expect(holdExpired(order(), at('2026-10-29 11:59'))).toBe(false);
    });

    it('not when the slot begins before the hold would end: the client may be on the way', () => {
      const soon = order({ startsAt: at('2026-10-29 11:00') });
      expect(holdExpired(soon, at('2026-10-29 13:00'))).toBe(false);
      const same = order({ startsAt: at('2026-10-29 12:00') });
      expect(holdExpired(same, at('2026-10-29 13:00'))).toBe(false);
    });

    it.each(['confirmed', 'in_work', 'cancelled', 'completed', 'no_show'] as const)(
      'never an order that is %s',
      (status) => {
        expect(holdExpired(order({ status }), at('2026-11-30 12:00'))).toBe(false);
      },
    );

    it('an order with no hold is never cancelled by it', () => {
      expect(holdExpired(order({ holdUntil: null }), at('2026-11-30 12:00'))).toBe(false);
    });
  });
});
