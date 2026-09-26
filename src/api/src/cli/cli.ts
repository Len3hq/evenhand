/**
 * Evenhand command line. Runs with the same modules, config and audit rules as the API.
 *
 *   node dist/cli/cli.js seed [--fixtures <path>]   import fixtures (+ demo data in demo mode)
 *   node dist/cli/cli.js openapi <out.json>          write the OpenAPI document (no database needed)
 *
 * In development: `npm run cli -- <command>` from the repo root.
 * In Docker:      `docker compose exec api node dist/cli/cli.js <command>`.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { buildOpenApi, configureApp } from '../app.setup.js';
import { AppConfig } from '../core/config.js';
import { SeedModule } from '../seed/seed.module.js';
import { formatLogins, SeedService } from '../seed/seed.service.js';

/** dist/cli/cli.js → repo root data/fixtures.json (same layout in the Docker image). */
const DEFAULT_FIXTURES = fileURLToPath(new URL('../../../../data/fixtures.json', import.meta.url));

const USAGE = `usage:
  cli seed [--fixtures <path>]
  cli openapi <out.json>`;

async function seed(args: string[]): Promise<void> {
  const flag = args.indexOf('--fixtures');
  const path = flag >= 0 ? args[flag + 1] : (process.env.FIXTURES_PATH ?? DEFAULT_FIXTURES);
  if (!path) throw new Error('--fixtures needs a path');

  const ctx = await NestFactory.createApplicationContext(SeedModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const { logins } = await ctx.get(SeedService).seed(path);
    if (logins) {
      // Printed as plain text so it is easy to copy from `docker compose logs api`.
      process.stdout.write(`\n${formatLogins(logins, ctx.get(AppConfig).demoPassword)}\n\n`);
    }
  } finally {
    await ctx.close();
  }
}

async function openapi(args: string[]): Promise<void> {
  const out = args[0];
  if (!out) throw new Error('openapi needs an output path');
  // Building the app does not connect to Postgres (Prisma connects lazily), but config
  // validation still wants a URL.
  process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  configureApp(app);
  await writeFile(out, `${JSON.stringify(buildOpenApi(app), null, 2)}\n`);
  await app.close();
  Logger.log(`wrote ${out}`, 'OpenAPI');
}

const [command, ...args] = process.argv.slice(2);
try {
  switch (command) {
    case 'seed':
      await seed(args);
      break;
    case 'openapi':
      await openapi(args);
      break;
    default:
      process.stderr.write(`${USAGE}\n`);
      process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
