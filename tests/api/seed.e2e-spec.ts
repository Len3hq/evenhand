/**
 * The fixture import runs on every boot, so it must be idempotent and faithful to the file.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const apiDir = fileURLToPath(new URL('../../src/api', import.meta.url));

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const counts = async () => ({
  events: await t.prisma.event.count({ where: { externalId: { not: null } } }),
  submissions: await t.prisma.submission.count({ where: { externalId: { not: null } } }),
  reviews: await t.prisma.review.count(),
  // Fixture judges (with a fixture id), like events and submissions above: other suites
  // invite judges of their own, which are not part of the import.
  judges: await t.prisma.eventRole.count({ where: { role: 'JUDGE', externalId: { not: null } } }),
  flags: await t.prisma.duplicateFlag.count(),
  users: await t.prisma.user.count(),
});

describe('fixture import', () => {
  it('matches fixtures.json', async () => {
    expect(await counts()).toMatchObject({ events: 1, submissions: 41, judges: 30, flags: 1 });
    // 126 fixture reviews; later suites may add drafts, never remove.
    expect((await counts()).reviews).toBeGreaterThanOrEqual(126);
  });

  it('is idempotent: a second boot changes nothing', async () => {
    const before = await counts();
    execFileSync('node', ['dist/cli/cli.js', 'seed'], {
      cwd: apiDir,
      env: { ...process.env },
      stdio: 'pipe',
    });
    expect(await counts()).toEqual(before);
  });

  it('keeps the fixture deadline, which is in the past', async () => {
    const e = await t.prisma.event.findUniqueOrThrow({ where: { externalId: 'evt_01' } });
    expect(e.submissionsClose.toISOString()).toBe('2026-03-01T18:00:00.000Z');
  });

  it('puts the first three fixture projects on gallery page 1 (acceptance check 2)', async () => {
    const res = await t.http().get('/api/projects');
    expect(res.body.items.slice(0, 3).map((p: { title: string }) => p.title)).toEqual([
      'Glass Signal',
      'Small Meadow',
      'Deep Compass',
    ]);
  });

  it('exports every review as CSV with a multi-column header and no BOM (acceptance check 7)', async () => {
    const res = await t
      .http()
      .get('/api/events/evt_01/export/scores.csv')
      .set(bearer(TOKENS.organizer));
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    const text = res.text;
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    const [header, ...rows] = text.trimEnd().split('\n');
    expect(header?.split(',')).toEqual(
      expect.arrayContaining([
        'judge_id',
        'project_id',
        'functionality',
        'innovation',
        'quality',
        'weighted_score',
      ]),
    );
    expect(rows.length).toBeGreaterThanOrEqual(126);
  });
});
