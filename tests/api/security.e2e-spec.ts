/**
 * Rate limits (decision 55): exports, judge writes and failed sign-ins each have their own
 * limit, counted per credential (per address for anonymous callers), and every refusal is audited once a minute for admins. Each test starts
 * an app with one limit set low; the rest of the suite runs with limits out of the way.
 */
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';
import { judgedEvent } from './scenario.js';

const organizer = bearer(TOKENS.organizer);
const apps: TestApp[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

async function app(config: Record<string, number>): Promise<TestApp> {
  const t = await createTestApp({ config });
  apps.push(t);
  return t;
}

const refusals = async (t: TestApp, limit: string) => {
  const admin = bearer(await tokenFor(t.prisma, 'admin@evenhand.local', 'security-admin'));
  const res = await t
    .http()
    .get('/api/audit')
    .query({ action: 'request.rate_limited', pageSize: 100 })
    .set(admin);
  return (
    res.body.items as { after: { limit: string }; ip: string | null; summary: string }[]
  ).filter((e) => e.after.limit === limit);
};

describe('the export limit', () => {
  it('refuses the fourth export in a minute when the limit is 3, and audits it once', async () => {
    const t = await app({ rateLimitExportPerMin: 3 });
    const before = (await refusals(t, 'export')).length;
    for (let i = 0; i < 3; i++) {
      expect(
        (await t.http().get('/api/events/evt_01/export/teams.csv').set(organizer)).status,
      ).toBe(200);
    }
    const refused = await t.http().get('/api/events/evt_01/export/scores.csv').set(organizer);
    expect(refused.status).toBe(429);
    expect(refused.body).toMatchObject({ statusCode: 429, error: 'rate_limited' });
    await t.http().get('/api/events/evt_01/export/audit.csv').set(organizer);

    const rows = await refusals(t, 'export');
    expect(rows.length - before).toBe(1);
    expect(rows[0]).toMatchObject({ ip: expect.any(String) });
    expect(rows[0]!.summary).toMatch(
      /^Too many requests \(export limit, 3 a minute\): refused GET /,
    );
  });

  it('does not slow down ordinary pages', async () => {
    const t = await app({ rateLimitExportPerMin: 1 });
    await t.http().get('/api/events/evt_01/export/teams.csv').set(organizer);
    for (let i = 0; i < 5; i++) expect((await t.http().get('/api/projects')).status).toBe(200);
  });
});

describe('the judge write limit', () => {
  it('refuses review saves beyond the limit', async () => {
    const t = await app({ rateLimitReviewPerMin: 2 });
    const s = await judgedEvent(t, { assigned: true });
    const judge = s.gamesJudges[0]!;
    const queue = (await t.http().get('/api/judge/queue').set(judge.headers)).body.events[0];
    const id = queue.items[0].assignmentId as string;
    const save = () =>
      t
        .http()
        .put(`/api/judge/reviews/${id}`)
        .set(judge.headers)
        .send({ values: { impact: 3 } });
    expect((await save()).status).toBe(200);
    expect((await save()).status).toBe(200);
    expect((await save()).status).toBe(429);
  });
});

describe('failed sign-ins', () => {
  it('refuses further bad tokens from an address for the minute, but never a valid one', async () => {
    const t = await app({ authFailuresPerMin: 3 });
    const guess = async (i: number) =>
      t
        .http()
        .get('/api/auth/me')
        .set(bearer(`guess-${i}`));
    for (let i = 0; i < 3; i++) expect((await guess(i)).status).toBe(401);
    const locked = await guess(3);
    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/Too many failed sign-in attempts/);
    // Behind the bundled proxy every visitor shares one address: someone guessing tokens must
    // not lock everyone else out, so a valid credential still gets through.
    expect((await t.http().get('/api/auth/me').set(organizer)).status).toBe(200);
    expect((await t.http().get('/api/projects')).status).toBe(200);
    expect((await guess(4)).status).toBe(429);
    const rows = await t.prisma.auditLog.findMany({ where: { action: 'request.rate_limited' } });
    expect(rows.some((r) => (r.after as { limit?: string }).limit === 'auth-failures')).toBe(true);
  });

  it('counts limits per credential, so callers sharing an address do not share a bucket', async () => {
    const t = await app({ rateLimitExportPerMin: 2 });
    const admin = bearer(await tokenFor(t.prisma, 'admin@evenhand.local', 'security-admin'));
    const csv = '/api/events/evt_01/export/teams.csv';
    for (let i = 0; i < 2; i++) expect((await t.http().get(csv).set(organizer)).status).toBe(200);
    expect((await t.http().get(csv).set(organizer)).status).toBe(429);
    // Same address (127.0.0.1), different credential: its own allowance.
    expect((await t.http().get(csv).set(admin)).status).toBe(200);
  });

  it('does not count a stale cookie on public pages as a guess', async () => {
    const t = await app({ authFailuresPerMin: 3 });
    for (let i = 0; i < 6; i++) {
      expect(
        (await t.http().get('/api/projects').set('Cookie', 'session=expired-long-ago')).status,
      ).toBe(200);
    }
    expect((await t.http().get('/api/auth/me').set(organizer)).status).toBe(200);
  });
});
