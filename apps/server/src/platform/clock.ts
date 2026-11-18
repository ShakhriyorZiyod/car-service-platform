/**
 * The current time comes from here, never from `new Date()` in a use case, so tests can set it
 * (docs/PLAN.md, section 4.5).
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
