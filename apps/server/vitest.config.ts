import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Tests read TEST_DATABASE_URL from the repo-root .env; they never touch DATABASE_URL.
const envFile = new URL('../../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // All files share one test database.
    fileParallelism: false,
  },
});
