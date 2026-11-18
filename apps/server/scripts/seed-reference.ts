/**
 * The starting reference data (TZ 14.1, 14.2, 14.4): brands and models, kinds of work and their
 * zones, reasons for cancelling. Safe in production and safe to run again; see db/seeds/reference.ts.
 *
 *   npm run seed:reference
 */
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { seedReference } from '../src/db/seeds/reference';
import { createLogger } from '../src/logger';

const config = loadConfig();
const logger = createLogger({ level: 'warn', pretty: config.env === 'development' });
const database = createDatabase(config.databaseUrl, { logger });

try {
  const report = await seedReference(database.db);
  const added =
    report.brands + report.models + report.serviceTypes + report.zones + report.cancelReasons;
  if (added === 0) {
    console.log('Ma‘lumotnomalar allaqachon bor, hech narsa qo‘shilmadi.');
  } else {
    console.log(
      `Qo‘shildi: ${report.brands} marka, ${report.models} model, ${report.serviceTypes} xizmat turi, ` +
        `${report.zones} zona (${report.excludes} ta "o‘chirish" qoidasi), ` +
        `${report.cancelReasons} bekor qilish sababi.`,
    );
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await database.close();
}
