/**
 * Creates the first owner, or makes an existing person (found by phone) an owner:
 *
 *   npm run owner:create -- --phone=+998901234567 --login=owner --name="Ism Familiya"
 *
 * The password is asked for twice and not shown. Without a terminal it is read from the first line
 * of standard input. The owner then opens the bot and shares this phone number, so the
 * second sign-in step can reach them.
 */
import { parseArgs } from 'node:util';
import { createServices, INIT_DATA_MAX_AGE_SECONDS } from '../src/composition';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db/client';
import { createLogger } from '../src/logger';
import { systemClock } from '../src/platform/clock';
import { storageDeps } from '../src/storage';
import { isAppError } from '../src/platform/errors';

function readHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk: string) => (data += chunk));
      stdin.on('end', () => resolve(data.split(/\r?\n/)[0] ?? ''));
    });
  }
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (result: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      result();
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(() => resolve(value));
        if (char === '\u0003') return finish(() => reject(new Error('cancelled')));
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdin.on('data', onData);
  });
}

const { values } = parseArgs({
  options: { phone: { type: 'string' }, login: { type: 'string' }, name: { type: 'string' } },
});
if (!values.phone || !values.login || !values.name) {
  console.error('Usage: npm run owner:create -- --phone=+998901234567 --login=owner --name="Ism"');
  process.exit(1);
}

const password = await readHidden('Parol: ');
if (process.stdin.isTTY && (await readHidden('Parolni takrorlang: ')) !== password) {
  console.error('Parollar mos kelmadi.');
  process.exit(1);
}

const config = loadConfig();
const logger = createLogger({ level: 'warn', pretty: config.env === 'development' });
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
  const owner = await services.identity.staff.bootstrapOwner({
    fullName: values.name,
    phone: values.phone,
    login: values.login,
    password,
  });
  console.log(`Egasi tayyor: ${owner.fullName}, login "${owner.login ?? ''}".`);
  console.log('Endi botni oching va shu telefon raqamini ulashing: 2-qadam kodi botga keladi.');
} catch (error) {
  console.error(
    isAppError(error) ? `Xato: ${error.code} ${error.details?.paths?.join(', ') ?? ''}` : error,
  );
  process.exitCode = 1;
} finally {
  await database.close();
}
