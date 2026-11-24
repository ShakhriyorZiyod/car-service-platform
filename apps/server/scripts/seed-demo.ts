/**
 * A workshop to click through, for development only: working hours, four boxes, a price matrix and
 * demo staff. It needs the reference data (`npm run seed:reference`) and an owner
 * (`npm run owner:create`), and fills only what is still empty.
 *
 *   npm run seed:demo
 */
import { and, eq } from 'drizzle-orm';
import { createServices, INIT_DATA_MAX_AGE_SECONDS } from '../src/composition';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { userRoles, users } from '../src/db/schema';
import { DEMO_PASSWORD, seedDemo } from '../src/db/seeds/demo';
import { createLogger } from '../src/logger';
import { permissionsOf } from '../src/modules/identity';
import { systemClock } from '../src/platform/clock';
import { storageDeps } from '../src/storage';
import { isAppError } from '../src/platform/errors';

const config = loadConfig();
if (config.env === 'production') {
  console.error('seed:demo faqat ishlab chiqishda ishlaydi, production’da emas.');
  process.exit(1);
}

const logger = createLogger({ level: 'warn', pretty: true });
const database = createDatabase(config.databaseUrl, { logger });
const services = createServices({
  db: database.db,
  clock: systemClock,
  logger,
  botToken: config.telegram.botToken ?? '',
  initDataMaxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
  adminUrl: config.urls?.admin ?? null,
  loginCodes: { send: () => Promise.reject(new Error('not used by this script')) },
  ...storageDeps(config),
});

try {
  const [owner] = await database.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'owner')))
    .where(eq(users.isBlocked, false))
    .limit(1);
  if (!owner) {
    console.error('Egasi yo‘q: avval `npm run owner:create` ni ishga tushiring.');
    process.exit(1);
  }

  const report = await seedDemo(services, {
    kind: 'staff',
    userId: owner.id,
    roles: ['owner'],
    permissions: new Set(permissionsOf(['owner'])),
  });

  console.log(
    [
      `Ish jadvali: ${report.hours ? 'yozildi' : 'bor edi'}; bayramlar: +${report.holidays}`,
      `Bokslar: +${report.boxes}`,
      `Prays: ${report.pricedTypes.length > 0 ? report.pricedTypes.join(', ') : 'bor edi'}`,
      `Xodimlar: ${report.staff.length > 0 ? report.staff.join(', ') : 'bor edi'}`,
      `Ombor: ${report.receipt === null ? 'bor edi' : `${report.products} mahsulot, kirim №${report.receipt}`}`,
    ].join('\n'),
  );
  if (report.staff.length > 0) {
    console.log(`\nDemo panel kirishlari: demo-admin va demo-director, parol: ${DEMO_PASSWORD}`);
    console.log('Rahbar 2-qadam kodi uchun Telegram ulanishi kerak; admin kodsiz kiradi.');
  }
} catch (error) {
  if (isAppError(error)) {
    console.error(`Xato: ${error.code} ${error.details?.paths?.join(', ') ?? ''}`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  await database.close();
}
