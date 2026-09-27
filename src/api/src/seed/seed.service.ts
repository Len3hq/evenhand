import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../core/config.js';
import { hashPassword } from '../core/passwords.js';
import { DemoSeeder, type DemoLogin } from './demo-seeder.service.js';
import { parseExtension } from './extension.js';
import { FixtureImporter, type ImportSummary } from './fixture-importer.service.js';
import { parseFixtures } from './fixtures.js';

export interface SeedResult {
  summary: ImportSummary;
  logins: DemoLogin[] | null;
}

@Injectable()
export class SeedService {
  private readonly logger = new Logger('Seed');

  constructor(
    private readonly config: AppConfig,
    private readonly importer: FixtureImporter,
    private readonly demo: DemoSeeder,
  ) {}

  /** Imports fixtures.json and, in demo mode, the demo accounts, event and tokens. */
  async seed(fixturesPath: string): Promise<SeedResult> {
    const fx = parseFixtures(JSON.parse(await readFile(fixturesPath, 'utf8')));
    // One hash for every seeded account in demo mode (argon2 is deliberately slow);
    // outside demo mode seeded accounts have no password until one is set.
    const passwordHash = this.config.demoMode ? await hashPassword(this.config.demoPassword) : null;

    const summary = await this.importer.import(fx, { passwordHash });
    const created = Object.entries(summary.created)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    this.logger.log(
      created
        ? `imported ${fixturesPath}: ${created}; duplicate flags=${summary.duplicatesFlagged}`
        : `fixtures already imported (${fixturesPath}); nothing to do`,
    );

    const logins = passwordHash ? await this.demo.seed(fx, summary.eventId, passwordHash) : null;
    return { summary, logins };
  }

  /**
   * Loads one event file: the organisers' fixtures.json shape, optionally with an Evenhand
   * export's `evenhand` block. Validated in full before anything is written; nothing is
   * written if it is invalid. No demo data, and the accounts it creates have no password
   * (`cli reset-password <email>` issues one). Safe to repeat: existing rows are kept.
   */
  async importFile(path: string): Promise<ImportSummary> {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    const fx = parseFixtures(raw);
    const extension = parseExtension(
      raw.evenhand,
      new Set(fx.tracks.map((t) => t.id)),
      new Set(fx.projects.map((p) => p.id)),
    );
    const summary = await this.importer.import(fx, { passwordHash: null, extension });
    this.logger.log(`imported ${path} into event ${summary.eventId}`);
    return summary;
  }
}

/** The block printed at boot; its header lines go straight into .dogfood.toml. */
export function formatLogins(logins: DemoLogin[], demoPassword: string): string {
  const width = Math.max(...logins.map((l) => l.role.length));
  const lines = logins
    .filter((l) => l.header)
    .map((l) => `  ${l.role.padEnd(width)}  ${l.header}    (${l.who})`);
  const people = logins.map((l) => `  ${l.role.padEnd(width)}  ${l.email}`);
  return [
    'seeded. test logins (DEMO_MODE=true: demo only, never use in production):',
    ...lines,
    '',
    `browser logins, password "${demoPassword}" (every seeded account uses it in demo mode):`,
    ...people,
  ].join('\n');
}
