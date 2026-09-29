/**
 * Evenhand command line. Runs with the same modules, config and audit rules as the API.
 *
 *   node dist/cli/cli.js seed [--fixtures <path>]   import fixtures (+ demo data in demo mode)
 *   node dist/cli/cli.js openapi <out.json>          write the OpenAPI document (no database needed)
 *   node dist/cli/cli.js create-admin <email> [--name <name>] [--reset-password]
 *                                                    make a platform admin; prints a new password once
 *   node dist/cli/cli.js reset-password <email>     new password for an account, printed once
 *   node dist/cli/cli.js export-event <event> [--out <file.json>]
 *                                                    an event in the fixtures.json shape (stdout by default)
 *   node dist/cli/cli.js import <file.json>         load an event file (fixtures.json shape), no demo data
 *   node dist/cli/cli.js tokens create <email> --label <label>
 *                                                    a bearer token for scripts; printed once
 *   node dist/cli/cli.js tokens list [<email>]      tokens with their state (never the secret)
 *   node dist/cli/cli.js tokens revoke <id> | --demo
 *                                                    revoke one token, or every demo token
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
import { AuditService } from '../core/audit.service.js';
import { Clock } from '../core/clock.js';
import { AppConfig } from '../core/config.js';
import { CoreModule } from '../core/core.module.js';
import { PrismaService } from '../core/prisma.service.js';
import { eventByRef } from '../core/refs.js';
import { AuditChainService } from '../modules/audit/audit-chain.service.js';
import { EventExportService } from '../modules/transfer/event-export.service.js';
import { TransferModule } from '../modules/transfer/transfer.module.js';
import { SeedModule } from '../seed/seed.module.js';
import { formatLogins, SeedService } from '../seed/seed.service.js';
import { createAdmin } from './create-admin.js';
import { resetPassword } from './reset-password.js';
import { createToken, listTokens, revokeTokens } from './tokens.js';

/** dist/cli/cli.js → repo root data/fixtures.json (same layout in the Docker image). */
const DEFAULT_FIXTURES = fileURLToPath(new URL('../../../../data/fixtures.json', import.meta.url));

const USAGE = `usage:
  cli seed [--fixtures <path>]
  cli openapi <out.json>
  cli create-admin <email> [--name <name>] [--reset-password]
  cli reset-password <email>
  cli export-event <event> [--out <file.json>]
  cli import <file.json>
  cli tokens create <email> --label <label>
  cli tokens list [<email>]
  cli tokens revoke <id> | --demo
  cli verify-audit                 check the audit log's hash chain (exit 1 if broken)`;

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

async function createAdminCommand(args: string[]): Promise<void> {
  const email = args[0];
  if (!email || email.startsWith('--')) throw new Error('create-admin needs an email address');
  const nameFlag = args.indexOf('--name');
  const name = nameFlag >= 0 ? args[nameFlag + 1] : undefined;
  if (nameFlag >= 0 && !name) throw new Error('--name needs a value');

  const ctx = await NestFactory.createApplicationContext(CoreModule, { logger: ['error'] });
  try {
    const result = await createAdmin(ctx.get(PrismaService), ctx.get(AuditService), {
      email,
      name,
      resetPassword: args.includes('--reset-password'),
    });
    const what = result.created ? 'created admin' : 'admin';
    process.stdout.write(
      result.password
        ? `${what} ${result.email}\npassword (shown once, store it now): ${result.password}\n`
        : `${what} ${result.email} (existing password kept; add --reset-password to replace it)\n`,
    );
  } finally {
    await ctx.close();
  }
}

async function resetPasswordCommand(args: string[]): Promise<void> {
  const email = args[0];
  if (!email) throw new Error('reset-password needs an email address');
  const ctx = await NestFactory.createApplicationContext(CoreModule, { logger: ['error'] });
  try {
    const password = await resetPassword(ctx.get(PrismaService), ctx.get(AuditService), email);
    process.stdout.write(
      `new password for ${email.trim().toLowerCase()} (shown once): ${password}\n`,
    );
  } finally {
    await ctx.close();
  }
}

async function exportEvent(args: string[]): Promise<void> {
  const ref = args[0];
  if (!ref || ref.startsWith('--'))
    throw new Error('export-event needs an event id, fixture id or slug');
  const outFlag = args.indexOf('--out');
  const out = outFlag >= 0 ? args[outFlag + 1] : undefined;
  if (outFlag >= 0 && !out) throw new Error('--out needs a file path');

  const ctx = await NestFactory.createApplicationContext(TransferModule, { logger: ['error'] });
  try {
    const event = await ctx.get(PrismaService).event.findFirst({ where: eventByRef(ref) });
    if (!event) throw new Error(`no event ${ref}`);
    const json = `${JSON.stringify(await ctx.get(EventExportService).export(event), null, 2)}\n`;
    if (out) {
      await writeFile(out, json);
      process.stderr.write(`wrote ${out}\n`);
    } else {
      process.stdout.write(json);
    }
  } finally {
    await ctx.close();
  }
}

async function importFile(args: string[]): Promise<void> {
  const path = args[0];
  if (!path) throw new Error('import needs a file path');
  // Warnings and errors only: stdout carries just the result line.
  const ctx = await NestFactory.createApplicationContext(SeedModule, { logger: ['warn', 'error'] });
  try {
    const { created, duplicatesFlagged } = await ctx.get(SeedService).importFile(path);
    const rows = Object.entries(created)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    process.stdout.write(
      rows
        ? `created ${rows}; duplicate flags=${duplicatesFlagged}\n`
        : 'nothing new: every row in the file already exists\n',
    );
  } finally {
    await ctx.close();
  }
}

async function verifyAudit(): Promise<void> {
  const ctx = await NestFactory.createApplicationContext(CoreModule, { logger: ['error'] });
  try {
    const chain = await new AuditChainService(ctx.get(PrismaService), ctx.get(Clock)).check();
    const lines = [
      chain.intact ? 'audit chain: INTACT' : 'audit chain: BROKEN',
      `  entries ${chain.entries}, linked ${chain.linked}, head ${chain.head}`,
    ];
    if (chain.alteredCount)
      lines.push(`  edited (${chain.alteredCount}): ${chain.altered.join(', ')}`);
    if (chain.brokenCount)
      lines.push(`  after a gap (${chain.brokenCount}): ${chain.broken.join(', ')}`);
    if (!chain.headMatches)
      lines.push('  the chain does not end at the recorded head: newest entries removed');
    process.stdout.write(`${lines.join('\n')}\n`);
    if (!chain.intact) process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

async function tokens(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  const ctx = await NestFactory.createApplicationContext(CoreModule, { logger: ['error'] });
  try {
    const prisma = ctx.get(PrismaService);
    const audit = ctx.get(AuditService);
    switch (sub) {
      case 'create': {
        const email = rest[0];
        if (!email || email.startsWith('--'))
          throw new Error('tokens create needs an email address');
        const labelFlag = rest.indexOf('--label');
        const label = labelFlag >= 0 ? rest[labelFlag + 1] : undefined;
        if (!label) throw new Error('tokens create needs --label <label>, e.g. --label ci-export');
        const t = await createToken(prisma, audit, email, label);
        process.stdout.write(
          `token ${t.id} "${t.label}" for ${t.email}\n` +
            `header (shown once, store it now): Authorization: Bearer ${t.token}\n`,
        );
        break;
      }
      case 'list': {
        const rows = await listTokens(prisma, rest[0]);
        if (!rows.length) {
          process.stdout.write('no tokens\n');
          break;
        }
        for (const r of rows) {
          const state = r.revokedAt ? `revoked ${r.revokedAt.toISOString()}` : 'active';
          const kind = r.isDemo ? ' demo' : '';
          process.stdout.write(
            `${r.id}  ${r.email}  "${r.label}"${kind}  created ${r.createdAt.toISOString()}  ${state}\n`,
          );
        }
        break;
      }
      case 'revoke': {
        const target = rest[0];
        if (!target)
          throw new Error('tokens revoke needs a token id (see: cli tokens list) or --demo');
        const ids = await revokeTokens(
          prisma,
          audit,
          ctx.get(Clock),
          target === '--demo' ? { demo: true } : { id: target },
        );
        process.stdout.write(
          ids.length ? `revoked ${ids.join(' ')}\n` : 'nothing to revoke: already revoked\n',
        );
        break;
      }
      default:
        throw new Error('tokens needs create, list or revoke');
    }
  } finally {
    await ctx.close();
  }
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
    case 'create-admin':
      await createAdminCommand(args);
      break;
    case 'reset-password':
      await resetPasswordCommand(args);
      break;
    case 'export-event':
      await exportEvent(args);
      break;
    case 'import':
      await importFile(args);
      break;
    case 'tokens':
      await tokens(args);
      break;
    case 'verify-audit':
      await verifyAudit();
      break;
    default:
      process.stderr.write(`${USAGE}\n`);
      process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
