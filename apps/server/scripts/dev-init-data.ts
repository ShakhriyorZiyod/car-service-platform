/**
 * Lets the Mini App run in a plain browser during development by writing signed data to
 * apps/tma/.env.local:
 *
 *   npm run dev:init-data -- [--user=<telegram id>] [--name=<first name>] [--lang=uz|ru]
 *                            [--phone=998901234567]
 *
 * `--phone` also signs a shared contact, which the "share phone" button uses outside Telegram.
 * Vite reads the file only in development; production builds drop the code that uses it.
 */
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config';
import { devBotToken } from './dev-token';
import { signContact, signInitData } from './telegram-signing';

const DEFAULT_DEV_USER_ID = 100_000_001;

const config = loadConfig();
if (config.env === 'production') throw new Error('dev:init-data must not run in production');

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    name: { type: 'string' },
    lang: { type: 'string' },
    phone: { type: 'string' },
  },
});

const token = devBotToken(config);
const now = new Date();
const id = Number(values.user ?? DEFAULT_DEV_USER_ID);
const firstName = values.name ?? 'Dev';

const lines = [
  `VITE_DEV_INIT_DATA=${signInitData({ id, firstName, languageCode: values.lang ?? 'uz' }, token, now)}`,
];
if (values.phone) {
  lines.push(
    `VITE_DEV_CONTACT=${signContact({ userId: id, phone: values.phone.replace(/^\+/, ''), firstName }, token, now)}`,
  );
}

const target = new URL('../../tma/.env.local', import.meta.url);
await writeFile(target, `${lines.join('\n')}\n`);
console.log(
  `Signed data for Telegram user ${id}${values.phone ? ' with a contact' : ''} written to apps/tma/.env.local`,
);
