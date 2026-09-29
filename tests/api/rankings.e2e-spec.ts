/**
 * Ranking runs, publishing and public results: the end of the judging lifecycle ("create,
 * submit, judge, publish"). The model itself is tested in the judging engine.
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';
import { judgedEvent, organizer } from './scenario.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

type Scenario = Awaited<ReturnType<typeof judgedEvent>>;

/** Every judge submits every review: judge i gives impact 2 + (i mod 3), polish 3. */
async function judgeEverything(s: Scenario) {
  const judges = [...s.gamesJudges, s.toolsJudge];
  for (const [i, j] of judges.entries()) {
    const q = (await t.http().get('/api/judge/queue').set(j.headers)).body.events.find(
      (e: { eventId: string }) => e.eventId === s.ev.id,
    );
    for (const item of q.items) {
      await t
        .http()
        .put(`/api/judge/reviews/${item.assignmentId}`)
        .set(j.headers)
        .send({ values: { impact: 2 + (i % 3), polish: 3 } });
      expect(
        (await t.http().post(`/api/judge/reviews/${item.assignmentId}/submit`).set(j.headers))
          .status,
      ).toBe(200);
    }
  }
}

const run = (slug: string) => t.http().post(`/api/events/${slug}/rankings`).set(organizer);
const publish = (id: string) => t.http().post(`/api/rankings/${id}/publish`).set(organizer);

describe('ranking an event', () => {
  it('refuses while there is nothing to rank', async () => {
    const s = await judgedEvent(t, { assigned: true });
    const res = await run(s.ev.slug);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('nothing_to_rank');
  });

  it('ranks projects with enough reviews, lists the rest, and explains each', async () => {
    const s = await judgedEvent(t, { assigned: true });
    await judgeEverything(s);
    const res = await run(s.ev.slug);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      publishedAt: null,
      current: true,
      params: { method: 'joint-ridge-v1', reviews: 13, weights: { impact: 2, polish: 1 } },
    });
    expect(res.body.inputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.outputHash).toMatch(/^[0-9a-f]{64}$/);

    const rows = res.body.rows as {
      projectId: string;
      rank: number | null;
      tieGroup: number | null;
      reason: string;
    }[];
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.rank !== null).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    const tools = rows.find((r) => r.projectId === s.toolsProject.id)!;
    expect(tools).toMatchObject({
      rank: null,
      tieGroup: null,
      reason: 'Not ranked: only 1 submitted review.',
    });
    for (const r of rows) expect(r.reason.length).toBeGreaterThan(10);
  });

  it('gives the same hashes for the same data', async () => {
    const s = await judgedEvent(t, { assigned: true });
    await judgeEverything(s);
    const a = (await run(s.ev.slug)).body;
    const b = (await run(s.ev.slug)).body;
    expect(b.inputsHash).toBe(a.inputsHash);
    expect(b.outputHash).toBe(a.outputHash);
  });
});

describe('publishing', () => {
  it('keeps results private until published, then shows them to everyone', async () => {
    const s = await judgedEvent(t, { assigned: true });
    await judgeEverything(s);
    const ranking = (await run(s.ev.slug)).body;

    const before = await t.http().get(`/api/events/${s.ev.slug}/results`);
    expect(before.status).toBe(404);
    expect(before.body.error).toBe('results_not_published');

    const pub = await publish(ranking.id);
    expect(pub.status).toBe(200);
    expect(pub.body.publishedAt).toEqual(expect.any(String));

    const after = await t.http().get(`/api/events/${s.ev.slug}/results`);
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject({
      method: 'joint-ridge-v1',
      inputsHash: ranking.inputsHash,
      outputHash: ranking.outputHash,
    });
    expect(after.body.rows.map((r: { projectId: string }) => r.projectId)).toEqual(
      ranking.rows.map((r: { projectId: string }) => r.projectId),
    );

    const audit = await t
      .http()
      .get(`/api/events/${s.ev.slug}/audit`)
      .query({ action: 'ranking.' })
      .set(organizer);
    expect(audit.body.items.map((e: { action: string }) => e.action)).toEqual([
      'ranking.published',
      'ranking.run',
    ]);
  });

  it('refuses to publish a ranking the data has moved on from', async () => {
    const s = await judgedEvent(t, { assigned: true });
    await judgeEverything(s);
    const old = (await run(s.ev.slug)).body;
    await t
      .http()
      .put(`/api/events/${s.ev.slug}/criteria`)
      .set(organizer)
      .send({
        criteria: [
          { key: 'impact', label: 'Impact', weight: 1, min: 1, max: 5 },
          { key: 'polish', label: 'Polish', weight: 1, min: 1, max: 5 },
        ],
      });
    const runs = (await t.http().get(`/api/events/${s.ev.slug}/rankings`).set(organizer)).body;
    expect(runs[0]).toMatchObject({ id: old.id, current: false });

    const res = await publish(old.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ranking_stale');
    const fresh = (await run(s.ev.slug)).body;
    expect((await publish(fresh.id)).status).toBe(200);
  });

  it('lets only the event’s organisers and admins see or publish a run', async () => {
    const s = await judgedEvent(t, { assigned: true });
    await judgeEverything(s);
    const ranking = (await run(s.ev.slug)).body;
    expect(
      (await t.http().get(`/api/rankings/${ranking.id}`).set(bearer(TOKENS.judge_a))).status,
    ).toBe(403);
    expect((await publish(ranking.id)).status).toBe(200);
    expect(
      (await t.http().post(`/api/rankings/${ranking.id}/publish`).set(bearer(TOKENS.participant)))
        .status,
    ).toBe(403);
  });
});

describe('the fixture event', () => {
  it('ranks exactly as the published Normalization Proof says', async () => {
    const res = await run('evt_01');
    expect(res.status).toBe(201);
    const ranked = res.body.rows.filter((r: { rank: number | null }) => r.rank !== null);
    expect(ranked).toHaveLength(40);
    expect(ranked[0]).toMatchObject({ externalId: 'prj_11', title: 'Salt Ledger', tieGroup: 1 });
    expect(new Set(ranked.map((r: { tieGroup: number }) => r.tieGroup)).size).toBe(2);
    expect(res.body.params).toMatchObject({ lambdaB: 32, lambdaQ: 16, atEdge: false });
  });

  it('exports the ranking as CSV', async () => {
    await run('evt_01');
    const res = await t.http().get('/api/events/evt_01/export/results.csv').set(organizer);
    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'rank,tie_group,project_id,title,team,track,reviews,raw_mean,normalized,sd,move,reason,run_id,published',
    );
    expect(lines[1]).toMatch(/^1,1,prj_11,Salt Ledger,/);
  });
});

describe('undecided duplicates', () => {
  it('records them in the run and refuses to publish until they are decided', async () => {
    const s = await judgedEvent(t, { assigned: true });
    await judgeEverything(s);
    // Two live projects flagged as a possible duplicate (different teams, same title).
    const [a, b] = s.gamesProjects;
    const flag = await t.prisma.duplicateFlag.create({
      data: { eventId: s.ev.id, keptId: b!.id, supersededId: a!.id, reason: 'SAME_TITLE' },
    });

    // Other suites count the fixture event's one flag across the whole database: remove ours after.
    onTestFinished(() =>
      t.prisma.duplicateFlag.deleteMany({ where: { id: flag.id } }).then(() => {}),
    );

    const ranking = (await run(s.ev.slug)).body;
    expect(ranking.params.pendingDuplicates).toEqual([
      expect.objectContaining({ flagId: flag.id, reason: 'SAME_TITLE', heldOutReviews: 0 }),
    ]);
    const refused = await publish(ranking.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('duplicates_pending');

    // Decided (dismissed: different teams): a fresh run publishes.
    expect((await t.http().post(`/api/duplicates/${flag.id}/dismiss`).set(organizer)).status).toBe(
      200,
    );
    const fresh = (await run(s.ev.slug)).body;
    expect(fresh.params.pendingDuplicates).toEqual([]);
    expect((await publish(fresh.id)).status).toBe(200);
  });

  it('counts the reviews a held copy keeps out of the fixture event’s ranking', async () => {
    const pending = await t.prisma.duplicateFlag.findFirst({
      where: { status: 'PENDING', superseded: { externalId: 'prj_07' } },
    });
    // Another suite may have decided Dry Harbour already; the rule is only visible while pending.
    if (!pending) return;
    const res = await run('evt_01');
    expect(res.body.params.pendingDuplicates).toEqual([
      expect.objectContaining({
        reason: 'SAME_TEAM',
        held: 'Dry Harbour (prj_07)',
        heldOutReviews: 5,
      }),
    ]);
  });
});
