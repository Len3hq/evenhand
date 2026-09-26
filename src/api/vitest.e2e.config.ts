import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const testsDir = fileURLToPath(new URL('../../tests/api', import.meta.url));
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://evenhand:evenhand@localhost:5433/evenhand_test';
// global-setup.ts runs in this (main) process and reads it from here.
process.env.TEST_DATABASE_URL = testDatabaseUrl;

// End-to-end tests: the real Nest app against a real Postgres (TEST_DATABASE_URL, a
// dedicated database whose name must end in _test). Files share it, so they run one at a time.
export default defineConfig({
  test: {
    globals: true,
    dir: testsDir,
    include: ['**/*.e2e-spec.ts'],
    globalSetup: [`${testsDir}/global-setup.ts`],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      DEMO_MODE: 'true',
      DEMO_PASSWORD: 'evenhand-demo',
      ALLOWED_ORIGINS: 'http://localhost:8080',
      // High limits so the suite itself is never throttled; the rate-limit test lowers them.
      RATE_LIMIT_DEFAULT_PER_MIN: '10000',
      RATE_LIMIT_LOGIN_PER_MIN: '10000',
    },
  },
});
