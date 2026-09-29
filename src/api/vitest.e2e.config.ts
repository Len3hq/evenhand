import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

const testsDir = fileURLToPath(new URL('../../tests/api', import.meta.url));
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://evenhand:evenhand@localhost:5433/evenhand_test';
// global-setup.ts runs in this (main) process and reads it from here.
process.env.TEST_DATABASE_URL = testDatabaseUrl;

const e2eEnv = {
  DATABASE_URL: testDatabaseUrl,
  DEMO_MODE: 'true',
  DEMO_PASSWORD: 'evenhand-demo',
  ALLOWED_ORIGINS: 'http://localhost:8080',
  // High limits so the suite itself is never throttled; the rate-limit test lowers them.
  RATE_LIMIT_DEFAULT_PER_MIN: '10000',
  RATE_LIMIT_LOGIN_PER_MIN: '10000',
  RATE_LIMIT_EXPORT_PER_MIN: '10000',
  RATE_LIMIT_REVIEW_PER_MIN: '10000',
  AUTH_FAILURES_PER_MIN: '10000',
  RATE_LIMIT_UPLOAD_PER_MIN: '10000',
  RATE_LIMIT_IMAGE_PER_MIN: '10000',
  RATE_LIMIT_COMMENT_PER_MIN: '10000',
  RATE_LIMIT_VOTE_PER_MIN: '10000',
  // Uploaded files go to a folder of their own, never a developer's ./uploads.
  UPLOADS_DIR: join(tmpdir(), 'evenhand-e2e-uploads'),
};
// global-setup.ts seeds through the CLI from this process, so it needs the same settings as
// the test workers; without them it seeds without demo data unless a local .env happens to
// set DEMO_MODE (CI has no .env).
Object.assign(process.env, e2eEnv);

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
    env: e2eEnv,
  },
});
