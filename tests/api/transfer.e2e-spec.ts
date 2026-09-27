/**
 * "A migration path in and out" (spec, Adoptability): an event leaves Evenhand in the
 * organisers' fixtures.json shape and comes back in through `cli import`, unchanged.
 *
 * Imports go into a second, empty database (a fresh portal), which is the real use and keeps
 * the shared test database free of copies.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { verifyPassword } from '../../src/api/src/core/passwords.js';
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';

const apiDir = fileURLToPath(new URL('../../src/api', import.meta.url));
const fixturesPath = fileURLToPath(new URL('../../data/fixtures.json', import.meta.url));
const organizer = bearer(TOKENS.organizer);
const work = mkdtempSync(join(tmpdir(), 'evenhand-transfer-'));

/** The fresh portal's database. Its name must end in _test, like every test database. */
const freshUrl = (() => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/evenhand_transfer_test';
  return url.toString();
})();

/* eslint-disable @typescript-eslint/no-explicit-any -- the files are JSON under test */
type Json = any;

function run(databaseUrl: string, ...args: string[]): string {
  return execFileSync('node', ['dist/cli/cli.js', ...args], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}
const fresh = (...args: string[]) => run(freshUrl, ...args);

async function sql<T = Json>(query: string, params: unknown[] = []): Promise<T[]> {
  const db = new pg.Client({ connectionString: freshUrl });
  await db.connect();
  try {
    return (await db.query(query, params)).rows as T[];
  } finally {
    await db.end();
  }
}

let t: TestApp;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
  const admin = new URL(freshUrl);
  admin.pathname = '/postgres';
  const db = new pg.Client({ connectionString: admin.toString() });
  await db.connect();
  await db.query('DROP DATABASE IF EXISTS evenhand_transfer_test WITH (FORCE)');
  await db.query('CREATE DATABASE evenhand_transfer_test');
  await db.end();
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: freshUrl },
    stdio: 'pipe',
  });
});
afterAll(() => t.close());

const exportOf = async (ref: string): Promise<Json> => {
  const res = await t.http().get(`/api/events/${ref}/export.json`).set(organizer);
  expect(res.status).toBe(200);
  return res.body;
};
const writeJson = (name: string, value: unknown): string => {
  const file = join(work, name);
  writeFileSync(file, JSON.stringify(value));
  return file;
};
const instant = (s: string) => new Date(s).toISOString();
const sortBy = <T>(list: T[], key: (x: T) => string) =>
  [...list].sort((a, b) => (key(a) < key(b) ? -1 : 1));

describe('exporting the fixture event', () => {
  it('reproduces the organisers’ fixtures.json, record for record', async () => {
    const original = JSON.parse(readFileSync(fixturesPath, 'utf8'));
    const out = await exportOf('evt_01');

    expect(out.event).toEqual({
      id: original.event.id,
      name: original.event.name,
      submissions_close: instant(original.event.submissions_close),
    });
    expect(out.tracks).toEqual(sortBy(original.tracks, (x: Json) => x.id));
    expect(out.judges).toEqual(
      sortBy(original.judges, (x: Json) => x.id).map((j: Json) => ({
        ...j,
        tracks: [...j.tracks].sort(),
      })),
    );
    expect(out.teams).toEqual(
      sortBy(original.teams, (x: Json) => x.id).map((tm: Json) => ({
        ...tm,
        members: [...tm.members].sort(),
      })),
    );
    // Projects keep the file's order.
    expect(out.projects).toEqual(
      original.projects.map((p: Json) => ({ ...p, submitted_at: instant(p.submitted_at) })),
    );
    const key = (s: Json) => `${s.judge}/${s.project}`;
    expect(sortBy(out.scores, key)).toEqual(
      sortBy(original.scores, key).map((s: Json) => ({ ...s, comment: s.comment ?? '' })),
    );
    expect(out.scores).toHaveLength(126);
  });

  it('is sent as a download', async () => {
    const res = await t.http().get('/api/events/evt_01/export.json').set(organizer);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="sample-hack-2026-export.json"',
    );
  });

  it('writes the same file from the command line', async () => {
    const file = join(work, 'cli-export.json');
    run(process.env.DATABASE_URL!, 'export-event', 'evt_01', '--out', file);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(await exportOf('evt_01'));
  });
});

describe('moving an event into a fresh portal', () => {
  it('imports the fixture event and exports it again byte for byte', async () => {
    const first = await exportOf('evt_01');
    const file = writeJson('evt_01.json', first);

    expect(fresh('import', file)).toMatch(/^created .*submissions=41.*reviews=126/);
    const again = join(work, 'evt_01-again.json');
    fresh('export-event', 'evt_01', '--out', again);
    expect(readFileSync(again, 'utf8')).toBe(`${JSON.stringify(first, null, 2)}\n`);

    expect(fresh('import', file)).toBe('nothing new: every row in the file already exists\n');
  });

  it('carries what the shared shape cannot: dates, prizes, taglines, links, tags', async () => {
    const created = await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({
        name: `Rich export ${++seq}`,
        submissionsClose: '2031-06-01T18:00:00Z',
        judgingClose: '2031-06-15T18:00:00Z',
      });
    expect(created.status).toBe(201);
    const event = created.body;
    const track = await t
      .http()
      .post(`/api/events/${event.slug}/tracks`)
      .set(organizer)
      .send({ name: 'Games' });
    expect(track.status).toBe(201);
    const prize = await t
      .http()
      .post(`/api/events/${event.slug}/prizes`)
      .set(organizer)
      .send({ name: 'Best game', description: '$100', track: track.body.id });
    expect(prize.status).toBe(201);

    const player = await person();
    expect(
      (await t.http().post(`/api/events/${event.slug}/teams`).set(player).send({ name: 'Ship' }))
        .status,
    ).toBe(201);
    const sub = await t
      .http()
      .post(`/api/events/${event.slug}/submissions`)
      .set(player)
      .send({
        title: 'Shipped',
        summary: 'A game',
        tagline: 'Play it',
        liveUrl: 'https://example.org/play',
        techTags: ['godot'],
      });
    expect(sub.status).toBe(201);
    expect((await t.http().post(`/api/submissions/${sub.body.id}/submit`).set(player)).status).toBe(
      200,
    );

    // A second team with only a draft: drafts stay private and are not exported.
    const drafter = await person();
    await t.http().post(`/api/events/${event.slug}/teams`).set(drafter).send({ name: 'Drafty' });
    const draft = await t
      .http()
      .post(`/api/events/${event.slug}/submissions`)
      .set(drafter)
      .send({ title: 'Private draft' });
    expect(draft.status).toBe(201);

    const out = await exportOf(event.slug);
    // The submitted project had no track, so it is exported in the placeholder track.
    expect(out.projects).toEqual([
      expect.objectContaining({ id: sub.body.id, title: 'Shipped', track: 'evenhand-no-track' }),
    ]);
    expect(out.tracks).toEqual([
      { id: track.body.id, name: 'Games' },
      { id: 'evenhand-no-track', name: 'No track' },
    ]);
    expect(out.evenhand.event).toEqual({
      slug: event.slug,
      opens_at: null,
      judging_close: '2031-06-15T18:00:00.000Z',
    });
    expect(out.evenhand.prizes).toEqual([
      { name: 'Best game', description: '$100', track: track.body.id },
    ]);
    expect(out.evenhand.projects).toEqual({
      [sub.body.id]: {
        tagline: 'Play it',
        live_url: 'https://example.org/play',
        tech_tags: ['godot'],
      },
    });

    // And it all arrives in the fresh portal.
    fresh('import', writeJson('rich.json', out));
    const back = join(work, 'rich-again.json');
    fresh('export-event', event.id, '--out', back);
    expect(JSON.parse(readFileSync(back, 'utf8'))).toEqual(out);
  });
});

describe('importing a bad file', () => {
  it('refuses it with every problem listed, and writes nothing', async () => {
    const before = (await sql<{ n: string }>('SELECT count(*) AS n FROM events'))[0]!.n;
    const file = writeJson('bad.json', {
      event: { id: 'evt_bad', name: 'Bad', submissions_close: 'not a date' },
      tracks: [],
      judges: [],
      teams: [],
      projects: [
        {
          id: 'p',
          team: 'nope',
          track: 'nope',
          title: 'x',
          summary: '',
          repo_url: '',
          submitted_at: '2026-01-01T00:00:00Z',
        },
      ],
      scores: [],
    });
    let stderr = '';
    try {
      fresh('import', file);
      expect.unreachable();
    } catch (e) {
      stderr = String((e as { stderr?: string }).stderr);
    }
    expect(stderr).toMatch(/event.submissions_close must be an ISO 8601 timestamp/);
    expect(stderr).toMatch(/refers to unknown team nope/);
    expect((await sql<{ n: string }>('SELECT count(*) AS n FROM events'))[0]!.n).toBe(before);
  });
});

describe('people arriving through an import', () => {
  it('have no password until an operator issues one', async () => {
    const email = `imported${++seq}@transfer.test`;
    fresh(
      'import',
      writeJson('people.json', {
        event: {
          id: `people_${seq}`,
          name: `People ${seq}`,
          submissions_close: '2031-01-01T00:00:00Z',
        },
        tracks: [{ id: 't', name: 'T' }],
        judges: [{ id: 'j', name: 'Imported Judge', email, tracks: ['t'] }],
        teams: [],
        projects: [],
        scores: [],
      }),
    );
    const [user] = await sql('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    expect(user.password_hash).toBeNull();

    const password = /\(shown once\): (\S+)/.exec(fresh('reset-password', email))![1]!;
    const [after] = await sql('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(await verifyPassword(after.password_hash, password)).toBe(true);
    const audit = await sql(
      "SELECT after FROM audit_log WHERE target_id = $1 AND action = 'user.password_reset'",
      [user.id],
    );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(password);
  });
});

async function person(): Promise<Record<string, string>> {
  const email = `mover${++seq}@transfer.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Mover ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return bearer(await tokenFor(t.prisma, email, `transfer-${seq}`));
}
