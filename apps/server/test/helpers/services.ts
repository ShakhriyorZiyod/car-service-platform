import { pino } from 'pino';
import { createServices, INIT_DATA_MAX_AGE_SECONDS, type Services } from '../../src/composition';
import type { Db } from '../../src/db/client';
import type { LoginCodeSender } from '../../src/modules/identity';
import { createFakeClock, type FakeClock } from './clock';

export const TEST_BOT_TOKEN = '1234567890:test-token-for-signatures-only';
export const ADMIN_URL = 'https://cs.example.uz/admin/';

/** Captures sign-in codes instead of sending them; a chat can be made unreachable. */
export interface FakeLoginCodes extends LoginCodeSender {
  lastCodeFor(telegramId: number): string | undefined;
  sentCount(telegramId: number): number;
  unreachable: Set<number>;
}

export function createFakeLoginCodes(): FakeLoginCodes {
  const sent = new Map<number, string[]>();
  const unreachable = new Set<number>();
  return {
    unreachable,
    send(to, code) {
      if (unreachable.has(to.telegramId)) return Promise.resolve('unreachable');
      sent.set(to.telegramId, [...(sent.get(to.telegramId) ?? []), code]);
      return Promise.resolve('sent');
    },
    lastCodeFor: (telegramId) => sent.get(telegramId)?.at(-1),
    sentCount: (telegramId) => sent.get(telegramId)?.length ?? 0,
  };
}

export interface TestContext {
  services: Services;
  clock: FakeClock;
  loginCodes: FakeLoginCodes;
}

/** The real services over the test database, with time and Telegram under the test's control. */
export function createTestServices(db: Db): TestContext {
  const clock = createFakeClock();
  const loginCodes = createFakeLoginCodes();
  const services = createServices({
    db,
    clock,
    logger: pino({ level: 'silent' }),
    botToken: TEST_BOT_TOKEN,
    initDataMaxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
    adminUrl: ADMIN_URL,
    loginCodes,
  });
  return { services, clock, loginCodes };
}
