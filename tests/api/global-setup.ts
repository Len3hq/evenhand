/**
 * Runs once before the e2e suite: creates the test database if needed, wipes it, applies
 * every migration (including the hand-written constraints) and seeds fixtures + demo data,
 * exactly as the Docker entrypoint does.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const apiDir = fileURLToPath(new URL('../../src/api', import.meta.url));
const fixtures = fileURLToPath(new URL('../../data/fixtures.json', import.meta.url));

export default async function setup(): Promise<void> {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  const dbName = url.pathname.slice(1);
  // Safety: this wipes the database. Never let it run against anything but a test database.
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${dbName}": e2e tests need a database whose name ends in _test`,
    );
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await db.end();

  const env = { ...process.env, DATABASE_URL: url.toString() };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env, stdio: 'pipe' });

  // Seed through the real CLI code path (built by `nest build` in the test:e2e script).
  execFileSync('node', ['dist/cli/cli.js', 'seed', '--fixtures', fixtures], {
    cwd: apiDir,
    env,
    stdio: 'pipe',
  });
}
