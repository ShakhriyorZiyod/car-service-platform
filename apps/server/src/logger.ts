import { pino, stdSerializers, type Logger } from 'pino';
import type { LogLevel } from './config';

export type { Logger };

/**
 * Personal data and secrets never reach the logs (docs/PLAN.md, section 2, rule 14).
 * `err.payload` is where grammY keeps the request body of a failed API call.
 */
const SENSITIVE_KEYS = [
  'token',
  'password',
  'code',
  'phone',
  'fullName',
  'text',
  'initData',
  'authorization',
  'cookie',
];

const REDACT_PATHS = [...SENSITIVE_KEYS, ...SENSITIVE_KEYS.map((key) => `*.${key}`), 'err.payload'];

const BOT_TOKEN = /\d{6,}:[\w-]{30,}/g;

interface FailedQuery {
  name: string;
  query: string;
  params: unknown;
  stack?: string;
  cause?: { name?: string; code?: string; message?: string };
}

const isFailedQuery = (err: unknown): err is FailedQuery =>
  err instanceof Error && 'query' in err && 'params' in err;

/**
 * Key-based redaction cannot help here: a failed query carries its parameters (names, phone
 * numbers) in `params`, in the message and in the stack. So it is reduced to what a person needs
 * to fix it: the SQL with its placeholders and PostgreSQL's error code.
 */
function describeFailedQuery(err: FailedQuery) {
  return {
    type: err.name,
    message: 'Failed query',
    query: err.query,
    reason: err.cause?.code ?? err.cause?.message ?? err.cause?.name,
    stack: err.stack
      ?.split('\n')
      .filter((line) => line.trimStart().startsWith('at '))
      .join('\n'),
  };
}

/** A failed network call to Telegram carries the URL, and the URL contains the bot token. */
const withoutToken = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value).replace(BOT_TOKEN, '[token]')) as T;

export function serializeError(err: unknown): unknown {
  return withoutToken(
    isFailedQuery(err) ? describeFailedQuery(err) : stdSerializers.err(err as Error),
  );
}

export function createLogger(options: { level: LogLevel; pretty: boolean }): Logger {
  return pino({
    level: options.level,
    serializers: { err: serializeError },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(options.pretty && {
      transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
    }),
  });
}
