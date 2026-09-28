/**
 * The organisers' integrity decisions: the fixtures' planted duplicate (Dry Harbour, prj_07
 * and prj_41) and disqualification. The duplicate tests decide the real fixture pair and undo
 * it at the end, checking that the undo restores every assignment and review exactly, so the
 * suites that compare the fixture event with fixtures.json see it untouched.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';
import { judgedEvent, organizer, person } from './scenario.js';

const fixtures = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../data/fixtures.json', import.meta.url)), 'utf8'),
) as { judges: { id: string; name: string }[] };
const judgeName = (id: string): string => fixtures.judges.find((j) => j.id === id)!.name;
const names = (...ids: string[]): string[] => ids.map(judgeName).sort();

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  // Leave the fixture pair as imported, whatever happened above.
  const flag = await t.prisma.duplicateFlag.findFirst({
    where: { superseded: { externalId: 'prj_07' }, event: { externalId: 'evt_01' } },
  });
  if (flag && flag.status !== 'PENDING') {
    await t.http().post(`/api/duplicates/${flag.id}/reopen`).set(organizer);
  }
  await t.close();
});

/** Every assignment and review of the pair, as comparable data. */
async function snapshot() {
  const subs = await t.prisma.submission.findMany({
    where: { event: { externalId: 'evt_01' }, externalId: { in: ['prj_07', 'prj_41'] } },
    orderBy: { externalId: 'asc' },
  });
  const assignments = await t.prisma.assignment.findMany({
    where: { submissionId: { in: subs.map((s) => s.id) } },
    include: { review: { include: { scores: { orderBy: { criterionId: 'asc' } } } } },
    orderBy: { id: 'asc' },
  });
  return {
    submissions: subs.map((s) => ({
      externalId: s.externalId,
      supersededById: s.supersededById,
      duplicateHold: s.duplicateHold,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      judgeRoleId: a.judgeRoleId,
      submissionId: a.submissionId,
      queuePosition: a.queuePosition,
      review: a.review && {
        id: a.review.id,
        status: a.review.status,
        superseded: a.review.superseded,
        originalSubmissionId: a.review.originalSubmissionId,
        scores: a.review.scores.map((s) => [s.criterionId, s.value]),
      },
    })),
  };
}

describe('the planted duplicate (Dry Harbour)', () => {
  let flagId: string;
  let before: Awaited<ReturnType<typeof snapshot>>;

  it('is listed as pending, with what confirming would do to each review', async () => {
    const res = await t.http().get('/api/events/evt_01/duplicates').set(organizer);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const f = res.body[0];
    flagId = f.id;
    expect(f).toMatchObject({
      reason: 'SAME_TEAM',
      status: 'PENDING',
      kept: { externalId: 'prj_41', state: 'IN_JUDGING', finalReviews: 4 },
      superseded: { externalId: 'prj_07', state: 'HELD', finalReviews: 5 },
      // jdg_01 and jdg_12 reviewed only prj_07; jdg_19, 21 and 26 reviewed both.
      merge: { moved: names('jdg_01', 'jdg_12'), setAside: names('jdg_19', 'jdg_21', 'jdg_26') },
      blockedBy: null,
      decidedBy: null,
    });
    before = await snapshot();
  });

  it('cannot be dismissed: one team has one live entry', async () => {
    const res = await t.http().post(`/api/duplicates/${flagId}/dismiss`).set(organizer);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_same_team');
    expect(await snapshot()).toEqual(before);
  });

  it('is refused to judges and participants before anything is looked up', async () => {
    for (const who of [TOKENS.judge_b, TOKENS.participant]) {
      for (const path of [`/api/duplicates/${flagId}/confirm`, '/api/duplicates/nope/confirm']) {
        const res = await t.http().post(path).set(bearer(who));
        expect(res.status).toBe(403);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it('confirming keeps prj_41 with 6 reviews and nobody counted twice', async () => {
    const res = await t.http().post(`/api/duplicates/${flagId}/confirm`).set(organizer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'CONFIRMED',
      kept: { externalId: 'prj_41', state: 'IN_JUDGING', finalReviews: 6 },
      superseded: { externalId: 'prj_07', state: 'REPLACED', finalReviews: 0 },
      merge: { moved: names('jdg_01', 'jdg_12'), setAside: names('jdg_19', 'jdg_21', 'jdg_26') },
      decidedBy: 'Demo Organizer',
    });

    // The moved reviews remember where they came from; the set-aside ones stay put.
    const prj07 = await t.prisma.submission.findFirstOrThrow({
      where: { externalId: 'prj_07', event: { externalId: 'evt_01' } },
    });
    const moved = await t.prisma.review.count({ where: { originalSubmissionId: prj07.id } });
    const setAside = await t.prisma.review.count({
      where: { superseded: true, assignment: { submissionId: prj07.id } },
    });
    expect({ moved, setAside }).toEqual({ moved: 2, setAside: 3 });
  });

  it('takes the replaced copy out of the gallery, judging and the judges’ queues', async () => {
    expect((await t.http().get('/api/projects/prj_07')).status).toBe(404);
    const found = await t.http().get('/api/projects').query({ q: 'Dry Harbour' });
    expect(found.body.items.map((p: { externalId: string }) => p.externalId)).toEqual(['prj_41']);

    const progress = await t.http().get('/api/events/evt_01/progress').set(organizer);
    const rows = progress.body.projects.filter((p: { title: string }) => p.title === 'Dry Harbour');
    expect(rows).toMatchObject([{ externalId: 'prj_41', finished: 6 }]);

    // judge_b is jdg_26, who reviewed both copies: only prj_41 is left in the queue.
    const queue = await t.http().get('/api/judge/queue').set(bearer(TOKENS.judge_b));
    const titles = queue.body.events.flatMap((e: { items: { title: string }[] }) =>
      e.items.map((i) => i.title),
    );
    expect(titles.filter((x: string) => x === 'Dry Harbour')).toHaveLength(1);

    const entries = await t.http().get('/api/events/evt_01/submissions').set(organizer);
    expect(entries.status).toBe(200);
    expect(entries.body).toHaveLength(41);
    expect(
      entries.body.find((e: { externalId: string }) => e.externalId === 'prj_07'),
    ).toMatchObject({
      state: 'REPLACED',
    });
  });

  it('cannot be decided twice', async () => {
    const res = await t.http().post(`/api/duplicates/${flagId}/confirm`).set(organizer);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('duplicate_decided');
  });

  it('reopening restores every assignment and review exactly', async () => {
    const res = await t.http().post(`/api/duplicates/${flagId}/reopen`).set(organizer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PENDING', decidedBy: null, decidedAt: null });
    expect(await snapshot()).toEqual(before);
    expect((await t.http().get('/api/projects/prj_07')).status).toBe(200);

    const again = await t.http().post(`/api/duplicates/${flagId}/reopen`).set(organizer);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('duplicate_decided');
  });

  it('writes each decision to the audit trail as a sentence', async () => {
    const res = await t
      .http()
      .get('/api/events/evt_01/audit')
      .query({ action: 'duplicate.confirmed' })
      .set(organizer);
    expect(res.status).toBe(200);
    const text = res.body.items[0].summary as string;
    expect(text).toContain('confirmed a duplicate: kept prj_41 Dry Harbour, replaced prj_07');
    expect(text).toContain(`reviews moved across: ${names('jdg_01', 'jdg_12').join(', ')}`);

    const reopened = await t
      .http()
      .get('/api/events/evt_01/audit')
      .query({ action: 'duplicate.reopened' })
      .set(organizer);
    expect(reopened.body.items[0].summary).toContain('it is pending again');
  });
});

describe('disqualification', () => {
  let s: Awaited<ReturnType<typeof judgedEvent>>;
  let target: string;
  beforeAll(async () => {
    s = await judgedEvent(t, { assigned: true });
    target = s.gamesProjects[0]!.id;
  });

  const inJudgingIds = async () => {
    const progress = await t.http().get(`/api/events/${s.ev.slug}/progress`).set(organizer);
    return progress.body.projects.map((p: { projectId: string }) => p.projectId) as string[];
  };

  it('needs a reason, and only applies to submitted entries', async () => {
    const empty = await t
      .http()
      .post(`/api/submissions/${target}/disqualify`)
      .set(organizer)
      .send({ reason: '   ' });
    expect(empty.status).toBe(400);
    const draft = await t
      .http()
      .post(`/api/submissions/${s.draft.id}/disqualify`)
      .set(organizer)
      .send({ reason: 'Not allowed' });
    expect(draft.status).toBe(409);
    expect(draft.body.error).toBe('not_submitted');
  });

  it('is refused to the team, judges and organisers of other events, the same way for a missing entry', async () => {
    // An organiser of another event.
    const other = await person(t, 'stranger');
    const otherEvent = (
      await t
        .http()
        .post('/api/events')
        .set(organizer)
        .send({ name: `Other ${Date.now()}`, submissionsClose: '2031-06-01T18:00:00Z' })
    ).body as { slug: string };
    const appointed = await t
      .http()
      .post(`/api/events/${otherEvent.slug}/organizers`)
      .set(organizer)
      .send({ email: other.email });
    expect(appointed.status).toBe(201);
    for (const headers of [
      s.gamesProjects[0]!.maker.headers,
      s.gamesJudges[0]!.headers,
      other.headers,
    ]) {
      for (const ref of [target, '0190a1b2-0000-7000-8000-000000000000']) {
        const res = await t
          .http()
          .post(`/api/submissions/${ref}/disqualify`)
          .set(headers)
          .send({ reason: 'Because' });
        expect(res.status).toBe(403);
      }
    }
  });

  it('takes the entry out of the gallery, judging and the judges’ queues, and tells the team why', async () => {
    const assignment = await t.prisma.assignment.findFirstOrThrow({
      where: { submissionId: target },
      include: { judgeRole: { include: { user: true } } },
    });
    const judge = s.gamesJudges.find((j) => j.id === assignment.judgeRole.userId)!;
    expect(await inJudgingIds()).toContain(target);

    const res = await t
      .http()
      .post(`/api/submissions/${target}/disqualify`)
      .set(organizer)
      .send({ reason: '  Code written before kickoff  ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      state: 'DISQUALIFIED',
      disqualifyReason: 'Code written before kickoff',
    });

    expect((await t.http().get(`/api/projects/${target}`)).status).toBe(404);
    expect(await inJudgingIds()).not.toContain(target);

    const queue = await t.http().get('/api/judge/queue').set(judge.headers);
    const ids = queue.body.events.flatMap((e: { items: { projectId: string }[] }) =>
      e.items.map((i) => i.projectId),
    );
    expect(ids).not.toContain(target);

    const review = await t.http().get(`/api/judge/reviews/${assignment.id}`).set(judge.headers);
    expect(review.status).toBe(200);
    expect(review.body).toMatchObject({
      inJudging: false,
      position: -1,
      previousAssignmentId: null,
    });
    const save = await t
      .http()
      .put(`/api/judge/reviews/${assignment.id}`)
      .set(judge.headers)
      .send({ values: { impact: 3 } });
    expect(save.status).toBe(409);
    expect(save.body.error).toBe('not_in_judging');

    const mine = await t
      .http()
      .get(`/api/submissions/${target}`)
      .set(s.gamesProjects[0]!.maker.headers);
    expect(mine.body).toMatchObject({
      eligibility: 'DISQUALIFIED',
      disqualifyReason: 'Code written before kickoff',
    });

    const twice = await t
      .http()
      .post(`/api/submissions/${target}/disqualify`)
      .set(organizer)
      .send({ reason: 'Again' });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('already_disqualified');
  });

  it('reinstating brings it back everywhere, and both steps are audited', async () => {
    const res = await t.http().post(`/api/submissions/${target}/reinstate`).set(organizer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'IN_JUDGING', disqualifyReason: null });
    expect((await t.http().get(`/api/projects/${target}`)).status).toBe(200);
    expect(await inJudgingIds()).toContain(target);

    const again = await t.http().post(`/api/submissions/${target}/reinstate`).set(organizer);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('not_disqualified');

    const audit = await t.http().get(`/api/events/${s.ev.slug}/audit`).set(organizer);
    const sentences = audit.body.items.map((i: { summary: string }) => i.summary);
    expect(sentences).toContainEqual(
      expect.stringMatching(/disqualified ".+": Code written before kickoff/),
    );
    expect(sentences).toContainEqual(expect.stringMatching(/reinstated ".+"/));
  });

  it('lists submitted entries only: drafts stay private to their team', async () => {
    const res = await t.http().get(`/api/events/${s.ev.slug}/submissions`).set(organizer);
    expect(res.status).toBe(200);
    const ids = res.body.map((e: { id: string }) => e.id);
    expect(ids).toHaveLength(5);
    expect(ids).not.toContain(s.draft.id);
  });
});
