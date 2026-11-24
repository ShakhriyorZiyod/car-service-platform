import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The architecture, enforced (docs/PLAN.md, section 4.3).
 *
 * apps/server/src/modules/<name>/
 *   domain     pure logic: no I/O, no frameworks, no other layer, no other module
 *   app        use cases: database, transactions, permissions; no transport libraries
 *   http, bot  thin adapters over app; never touch the database
 *   another module is reached only through its index.ts
 *
 * apps/tma: the client and master parts and the features inside them do not import each other;
 *   zod stays out of the bundle; only telegram.ts talks to the Telegram SDK.
 * apps/admin: features do not import each other.
 * packages/shared: depends on nothing else in the repository.
 *
 * ESLint applies only the last matching config for a rule, so every file group below gets one
 * `no-restricted-imports` with all of its restrictions combined.
 */

const SERVER_MODULES = [
  'identity',
  'audit',
  'workshop',
  'catalog',
  'garage',
  'booking',
  'orders',
  'clients',
  'media',
  'reception',
  'tasks',
  'payments',
  'dashboard',
  'stock',
  'shop',
];
const MODULE_LAYERS = ['domain', 'app', 'http', 'bot'];

const TMA_SHELLS = {
  client: ['home', 'garage', 'booking', 'orders', 'profile', 'shop'],
  master: ['tasks', 'task', 'photo-queue'],
  staff: [],
};

const ADMIN_FEATURES = [
  'today',
  'orders',
  'order',
  'new-order',
  'reception',
  'tasks',
  'handover',
  'schedule',
  'clients',
  'settings',
  'stock',
  'shop',
];

const TRANSPORT = ['fastify', 'fastify/*', '@fastify/*', 'grammy', 'grammy/*', '@grammyjs/*'];
const DATA = ['pg', 'drizzle-orm', 'drizzle-orm/*'];

/** Both the folder itself and anything inside it. */
const folder = (path) => [`**/${path}`, `**/${path}/**`];

const restrict = (rules) => ({
  'no-restricted-imports': ['error', { patterns: rules.filter((rule) => rule.group.length > 0) }],
});

/** Server code outside the modules may use a module only through its index.ts. */
const moduleInternals = {
  group: SERVER_MODULES.flatMap((name) =>
    MODULE_LAYERS.flatMap((layer) => folder(`modules/${name}/${layer}`)),
  ),
  message: 'use another module through its index.ts only.',
};

/** Inside a module, other modules are reached through their index.ts only. */
const otherModulesInternals = (own) => ({
  group: SERVER_MODULES.filter((name) => name !== own).flatMap((name) =>
    MODULE_LAYERS.flatMap((layer) => folder(`${name}/${layer}`)),
  ),
  message: 'use another module through its index.ts only.',
});

const LAYER_RULES = {
  domain: {
    group: [
      ...TRANSPORT,
      ...DATA,
      'pino',
      ...folder('db'),
      ...folder('platform'),
      ...folder('app'),
      ...folder('http'),
      ...folder('bot'),
      ...folder('jobs'),
      '**/config',
      '**/logger',
      ...SERVER_MODULES.map((name) => `**/${name}`),
    ],
    message: 'domain is pure: no I/O, no frameworks, no other layer or module.',
  },
  app: {
    group: [...TRANSPORT, ...folder('http'), ...folder('bot'), ...folder('jobs')],
    message: 'the app layer does not know transports or adapters; use ports.',
  },
  http: {
    group: [...DATA, ...folder('db')],
    message: 'adapters go through app services; no direct database access.',
  },
  bot: {
    group: [...DATA, ...folder('db')],
    message: 'adapters go through app services; no direct database access.',
  },
};

const serverModuleBoundaries = SERVER_MODULES.flatMap((name) =>
  MODULE_LAYERS.map((layer) => ({
    files: [`apps/server/src/modules/${name}/${layer}/**/*.ts`],
    rules: restrict([LAYER_RULES[layer], otherModulesInternals(name)]),
  })),
);

/** One part of the Mini App must not import another, nor a feature another feature. */
const tmaBoundaries = Object.entries(TMA_SHELLS).flatMap(([shell, features]) => {
  const otherShells = {
    group: Object.keys(TMA_SHELLS)
      .filter((other) => other !== shell)
      .flatMap((other) => [
        ...folder(`shells/${other}`),
        `../${other}`,
        `../${other}/**`,
        `../../${other}`,
        `../../${other}/**`,
      ]),
    message: 'parts of the Mini App do not import each other: share through ui/, lib/ and api.ts.',
  };
  return [
    { files: [`apps/tma/src/shells/${shell}/*.{ts,tsx}`], rules: restrict([otherShells]) },
    ...features.map((feature) => ({
      files: [`apps/tma/src/shells/${shell}/${feature}/**/*.{ts,tsx}`],
      rules: restrict([
        otherShells,
        {
          group: features
            .filter((other) => other !== feature)
            .flatMap((other) => [...folder(`${shell}/${other}`), `../${other}`, `../${other}/**`]),
          message:
            'features do not import each other: share through ui/ and lib/, navigate through props.',
        },
      ]),
    })),
  ];
});

const adminBoundaries = ADMIN_FEATURES.map((feature) => ({
  files: [`apps/admin/src/features/${feature}/**/*.{ts,tsx}`],
  rules: restrict([
    {
      group: ADMIN_FEATURES.filter((other) => other !== feature).flatMap((other) => [
        ...folder(`features/${other}`),
        `../${other}`,
        `../${other}/**`,
      ]),
      message: 'features do not import each other: share through ui/, lib/ and api.ts.',
    },
  ]),
}));

export default defineConfig(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'apps/server/src/db/migrations/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // packages/shared
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: restrict([
      {
        group: ['**/apps/**', '@cs/server', '@cs/tma', '@cs/admin'],
        message: 'shared depends on nothing in the repo.',
      },
    ]),
  },

  // apps/server
  {
    files: ['apps/server/src/**/*.ts'],
    ignores: ['apps/server/src/modules/**', 'apps/server/src/lib/**'],
    rules: restrict([moduleInternals]),
  },
  {
    files: ['apps/server/src/lib/**/*.ts'],
    rules: restrict([
      {
        group: [
          ...TRANSPORT,
          ...DATA,
          'pino',
          ...folder('db'),
          ...folder('platform'),
          ...folder('modules'),
          ...folder('http'),
          ...folder('bot'),
          ...folder('jobs'),
          '**/config',
          '**/logger',
        ],
        message: 'lib is pure: no I/O, no frameworks, no other layer.',
      },
    ]),
  },
  serverModuleBoundaries,

  // apps/tma and apps/admin
  {
    files: ['apps/{tma,admin}/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/tma/src/**/*.{ts,tsx}'],
    rules: {
      // The point of the dependency-free subpaths: schemas and zod stay out of the bundle.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@cs/shared',
              allowTypeImports: true,
              message:
                'Types only. Values come from @cs/shared/routes, /format, /vocabulary or /i18n.',
            },
            { name: 'zod', message: 'zod stays out of the Mini App bundle.' },
          ],
          patterns: [
            { group: ['@tma.js/*'], message: 'Only src/telegram.ts talks to the Telegram SDK.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/tma/src/telegram.ts'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
  tmaBoundaries,
  {
    files: ['apps/admin/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@tma.js/*'], message: 'The panel runs in a browser, not in Telegram.' },
          ],
        },
      ],
    },
  },
  adminBoundaries,
  prettier,
);
