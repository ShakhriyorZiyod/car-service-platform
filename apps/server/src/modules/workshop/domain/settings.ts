import { settingsSchema, type Rules, type Settings } from '@cs/shared';

/**
 * The workshop's settings (docs/PLAN.md, section 7.4). The database keeps only what the owner
 * saved; what is missing comes from here, so a new setting needs no migration.
 */
export const DEFAULT_SETTINGS: Settings = {
  workshop: {
    name: 'CarService',
    address: null,
    phone: null,
    mapUrl: null,
    policyUrl: null,
    /** A draft until the real policy is entered (docs/PLAN.md, section 21, question 6). */
    policyVersion: 'draft-2026-11',
  },
  rules: {
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
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * What the database holds, completed with the defaults and checked. A stored value that no longer
 * fits the schema fails loudly instead of quietly running the workshop on wrong numbers.
 */
export function readSettings(stored: unknown): Settings {
  const data = isRecord(stored) ? stored : {};
  return settingsSchema.parse({
    workshop: {
      ...DEFAULT_SETTINGS.workshop,
      ...(isRecord(data.workshop) ? data.workshop : {}),
    },
    rules: { ...DEFAULT_SETTINGS.rules, ...(isRecord(data.rules) ? data.rules : {}) },
  });
}

/** Reminders from the earliest to the latest, each hour once: 24, 2. */
export function normalizeReminderHours(hours: readonly number[]): number[] {
  return [...new Set(hours)].sort((a, b) => b - a);
}

export function normalizeRules(rules: Rules): Rules {
  return { ...rules, reminderHours: normalizeReminderHours(rules.reminderHours) };
}
