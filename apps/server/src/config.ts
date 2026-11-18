import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Treats empty or whitespace-only env values as "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  /** Telegram opens Mini Apps only over HTTPS. */
  PUBLIC_URL: optional(z.url({ protocol: /^https$/ })),
  TELEGRAM_BOT_TOKEN: optional(z.string()),

  HTTP_HOST: z.string().min(1).default('127.0.0.1'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** The panel's session cookie travels only over HTTPS; by default on in production only. */
  COOKIE_SECURE: optional(z.enum(['true', 'false'])),

  /** Where photos are kept on disk (docs/PLAN.md, section 4.9). */
  UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
  /** Signs the photo links; at least 32 characters. Required in production. */
  MEDIA_URL_SECRET: optional(z.string().min(32)),
});

/** Where people open the two clients (docs/PLAN.md, section 4.1). */
export interface PublicUrls {
  miniApp: string;
  admin: string;
}

export interface Config {
  env: 'development' | 'test' | 'production';
  logLevel: LogLevel;
  databaseUrl: string;
  /** Absent until a tunnel or domain is set: the bot then has no button to show. */
  urls: PublicUrls | undefined;
  telegram: {
    /** Absent in scripts that never talk to Telegram (migrations, dev:api). */
    botToken: string | undefined;
  };
  http: { host: string; port: number };
  cookieSecure: boolean;
  uploadsDir: string;
  /**
   * Absent in development: a random one is made at start, which only means that photo links stop
   * working after a restart.
   */
  mediaUrlSecret: string | undefined;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function publicUrls(publicUrl: string | undefined): PublicUrls | undefined {
  if (!publicUrl) return undefined;
  const origin = publicUrl.replace(/\/+$/, '');
  return { miniApp: `${origin}/`, admin: `${origin}/admin/` };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && !e.MEDIA_URL_SECRET) {
    throw new ConfigError('MEDIA_URL_SECRET is required in production.');
  }
  return {
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    databaseUrl: e.DATABASE_URL,
    urls: publicUrls(e.PUBLIC_URL),
    telegram: { botToken: e.TELEGRAM_BOT_TOKEN },
    http: { host: e.HTTP_HOST, port: e.HTTP_PORT },
    cookieSecure: e.COOKIE_SECURE ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
    uploadsDir: e.UPLOADS_DIR,
    mediaUrlSecret: e.MEDIA_URL_SECRET,
  };
}

/** What the full service needs on top of `loadConfig`; scripts and dev:api do not need it. */
export function requireBotRuntime(config: Config): { botToken: string } {
  if (!config.telegram.botToken) {
    throw new ConfigError(
      'TELEGRAM_BOT_TOKEN is not set (use a separate test bot for development, or npm run dev:api).',
    );
  }
  return { botToken: config.telegram.botToken };
}
