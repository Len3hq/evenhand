/**
 * T2 judge console: a judge's queue, drafts and final reviews. Judges reach only their own
 * assignments; who may call each route is also in isolation.e2e-spec.ts.
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';
import { judgedEvent, organizer, person } from './scenario.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

type Headers = Record<string, string>;
const queue = async (as: Headers) => (await t.http().get('/api/judge/queue').set(as)).body;
const get = (id: string, as: Headers) => t.http().get(`/api/judge/reviews/${id}`).set(as);
const save = (id: string, body: object, as: Headers) =>
  t.http().put(`/api/judge/reviews/${id}`).set(as).send(body);
const submit = (id: string, as: Headers) =>
  t.http().post(`/api/judge/reviews/${id}/submit`).set(as);

/** A judged event and its first Games judge's first assignment. */
async function setup() {
  const s = await judgedEvent(t, { assigned: true });
  const judge = s.gamesJudges[0]!;
  const mine = (await queue(judge.headers)).events.find(
    (e: { eventId: string }) => e.eventId === s.ev.id,
  );
  return { ...s, judge, mine, first: mine.items[0].assignmentId as string };
}

describe('the queue', () => {
  it('lists the judge’s own assignments in order, not started, with progress', async () => {
    const s = await setup();
    expect(s.mine).toMatchObject({ assigned: 3, finished: 0, judgingOpen: true });
    expect(s.mine.items.map((i: { position: number }) => i.position)).toEqual([0, 1, 2]);
    expect(s.mine.items.every((i: { state: string }) => i.state === 'NOT_STARTED')).toBe(true);
    expect(s.mine.items.every((i: { track: string }) => i.track === 'Games')).toBe(true);
  });
});

describe('a review', () => {
  it('shows the project, the rubric with shares, and the queue around it', async () => {
    const s = await setup();
    const res = await get(s.first, s.judge.headers);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      position: 0,
      queueLength: 3,
      previousAssignmentId: null,
      nextAssignmentId: s.mine.items[1].assignmentId,
      state: 'NOT_STARTED',
      values: {},
      weightedScore: null,
      project: { track: 'Games' },
    });
    expect(res.body.criteria).toEqual([
      { key: 'impact', label: 'Impact', min: 1, max: 5, share: 2 / 3 },
      { key: 'polish', label: 'Polish', min: 1, max: 5, share: 1 / 3 },
    ]);
  });

  it('keeps a partial draft, then submits once every criterion is marked', async () => {
    const s = await setup();
    const draft = await save(
      s.first,
      { values: { impact: 4 }, comment: 'Promising' },
      s.judge.headers,
    );
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({
      state: 'DRAFT',
      values: { impact: 4 },
      weightedScore: null,
    });

    const early = await submit(s.first, s.judge.headers);
    expect(early.status).toBe(400);
    expect(early.body.message).toBe('Mark every criterion before submitting: Polish.');

    await save(s.first, { values: { polish: 2 } }, s.judge.headers);
    const final = await submit(s.first, s.judge.headers);
    expect(final.status).toBe(200);
    expect(final.body).toMatchObject({
      state: 'FINAL',
      values: { impact: 4, polish: 2 },
      comment: 'Promising',
      weightedScore: (2 * 4 + 2) / 3,
      submittedAt: expect.any(String),
    });

    const q = (await queue(s.judge.headers)).events.find(
      (e: { eventId: string }) => e.eventId === s.ev.id,
    );
    expect(q).toMatchObject({ finished: 1 });
    expect(q.items[0].state).toBe('FINAL');
    // The judge's own scores (acceptance check 4) include it.
    const own = (await t.http().get('/api/judge/scores').set(s.judge.headers)).body.items;
    expect(own).toContainEqual(
      expect.objectContaining({ status: 'FINAL', values: { impact: 4, polish: 2 } }),
    );
  });

  it('is final once submitted: no more edits, and submitting again changes nothing', async () => {
    const s = await setup();
    await save(s.first, { values: { impact: 3, polish: 3 } }, s.judge.headers);
    const first = (await submit(s.first, s.judge.headers)).body;
    const edit = await save(s.first, { values: { impact: 5 } }, s.judge.headers);
    expect(edit.status).toBe(409);
    expect(edit.body.error).toBe('review_final');
    expect((await submit(s.first, s.judge.headers)).body.submittedAt).toBe(first.submittedAt);
  });

  it.each([
    ['a mark above the range', { impact: 6 }],
    ['a fraction', { impact: 2.5 }],
    ['a criterion the event does not have', { novelty: 3 }],
  ])('refuses %s with 400', async (_, values) => {
    const s = await setup();
    const res = await save(s.first, { values }, s.judge.headers);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('clears a mark with null', async () => {
    const s = await setup();
    await save(s.first, { values: { impact: 4, polish: 4 } }, s.judge.headers);
    const res = await save(s.first, { values: { polish: null } }, s.judge.headers);
    expect(res.body.values).toEqual({ impact: 4 });
  });

  it('is audited when started and when submitted, not on every draft save', async () => {
    const s = await setup();
    await save(s.first, { values: { impact: 4 } }, s.judge.headers);
    await save(s.first, { values: { polish: 5 } }, s.judge.headers);
    await submit(s.first, s.judge.headers);
    const audit = await t
      .http()
      .get(`/api/events/${s.ev.slug}/audit`)
      .query({ action: 'review.' })
      .set(organizer);
    expect(audit.body.items.map((e: { summary: string }) => e.summary)).toEqual([
      expect.stringMatching(/^judge \d+ submitted a review of "Project \d+": impact 4, polish 5$/),
      expect.stringMatching(/^judge \d+ started reviewing "Project \d+"$/),
    ]);
  });

  it('closes when judging closes', async () => {
    const s = await setup();
    await t.prisma.event.update({
      where: { id: s.ev.id },
      data: {
        submissionsClose: new Date('2020-01-01T00:00:00Z'),
        judgingClose: new Date('2020-02-01T00:00:00Z'),
      },
    });
    const res = await save(s.first, { values: { impact: 4 } }, s.judge.headers);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('judging_closed');
    expect((await get(s.first, s.judge.headers)).body.judgingOpen).toBe(false);
  });
});

describe('isolation', () => {
  it('refuses another judge the same way whether or not the assignment exists', async () => {
    const s = await setup();
    const other = s.gamesJudges[1]!;
    const real = await get(s.first, other.headers);
    const fake = await get('00000000-0000-7000-8000-000000000000', other.headers);
    expect(real.status).toBe(403);
    expect(fake.body).toEqual(real.body);
    expect((await save(s.first, { values: { impact: 1 } }, other.headers)).status).toBe(403);
    expect((await submit(s.first, other.headers)).status).toBe(403);
  });

  it('refuses the event’s organiser and people who judge nothing', async () => {
    const s = await setup();
    expect((await get(s.first, organizer)).status).toBe(403);
    const nobody = await person(t, 'nobody');
    expect((await t.http().get('/api/judge/queue').set(nobody.headers)).status).toBe(403);
    expect((await get(s.first, bearer(TOKENS.participant))).status).toBe(403);
  });
});
