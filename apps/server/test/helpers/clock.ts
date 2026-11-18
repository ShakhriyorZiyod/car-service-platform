import type { Clock } from '../../src/platform/clock';

export interface FakeClock extends Clock {
  set(instant: Date | string): void;
  advance(ms: number): void;
}

/** Time under the test's control. Starts on a Thursday morning in Tashkent. */
export function createFakeClock(start: Date | string = '2026-10-29T05:00:00.000Z'): FakeClock {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    set: (instant) => {
      current = new Date(instant);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}
