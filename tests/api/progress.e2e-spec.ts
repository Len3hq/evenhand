/**
 * T2 "a live organizer progress dashboard", and the event's CSV exports at every stage. Who may
 * read them is in isolation.e2e-spec.ts.
 */
import { createTestApp, type TestApp } from './helpers.js';
import { judgedEvent, organizer } from './scenario.js';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

interface JudgeRow {
  judgeId: string;
  externalId: string | null;
  assigned: number;
  finished: number;
  drafts: number;
  notStarted: number;
  lastActivity: string | null;
  flat: boolean;
}
interface ProjectRow {
  projectId: string;
  externalId: string | null;
  assigned: number;
  finished: number;
  drafts: number;
}

const progress = async (slug: string) => {
  const res = await t.http().get(`/api/events/${slug}/progress`).set(organizer);
  expect(res.status).toBe(200);
  return res.body as {
    totals: Record<string, number>;
    judges: JudgeRow[];
    projects: ProjectRow[];
  };
};
const csv = async (slug: string, name: string) => {
  const res = await t.http().get(`/api/events/${slug}/export/${name}.csv`).set(organizer);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^text\/csv/);
  return res.text.trim().split('\n');
};

describe('the fixture event', () => {
  it('flags the judge who gave every project the same marks, and only them (not jdg_19, whose different marks average the same)', async () => {
    const p = await progress('evt_01');
    const flat = p.judges.filter((j) => j.flat).map((j) => j.externalId);
    expect(flat).toEqual(['jdg_07']);
    expect(p.judges.find((j) => j.externalId === 'jdg_24')).toMatchObject({
      assigned: 11,
      finished: 11,
      flat: false,
    });
  });

  it('counts the 40 projects in judging (the held duplicate copy is not one of them)', async () => {
    const p = await progress('evt_01');
    expect(p.projects).toHaveLength(40);
    expect(p.projects.some((x) => x.externalId === 'prj_07')).toBe(false);
    expect(p.projects.filter((x) => x.finished === 2)).toHaveLength(8); // the unfinished batches
    expect(p.totals).toMatchObject({
      projects: 40,
      projectsUnreviewed: 0,
      drafts: 0,
      notStarted: 0,
    });
  });
});

describe('an event being judged', () => {
  it('shows who has started, drafts, finished work and what each project still needs', async () => {
    const s = await judgedEvent(t, { assigned: true });
    const [busy, idle] = s.gamesJudges;
    const queue = (await t.http().get('/api/judge/queue').set(busy!.headers)).body.events.find(
      (e: { eventId: string }) => e.eventId === s.ev.id,
    );
    const [a, b] = queue.items.map((i: { assignmentId: string }) => i.assignmentId);
    await t
      .http()
      .put(`/api/judge/reviews/${a}`)
      .set(busy!.headers)
      .send({ values: { impact: 4, polish: 4 } });
    await t.http().post(`/api/judge/reviews/${a}/submit`).set(busy!.headers);
    await t
      .http()
      .put(`/api/judge/reviews/${b}`)
      .set(busy!.headers)
      .send({ values: { impact: 2 } });

    const p = await progress(s.ev.slug);
    expect(p.judges.find((j) => j.judgeId === busy!.judgeId)).toMatchObject({
      assigned: 3,
      finished: 1,
      drafts: 1,
      notStarted: 1,
      lastActivity: expect.any(String),
      flat: false,
    });
    expect(p.judges.find((j) => j.judgeId === idle!.judgeId)).toMatchObject({
      finished: 0,
      notStarted: 3,
      lastActivity: null,
    });
    expect(p.totals).toMatchObject({
      judges: 5,
      judgesNotStarted: 4,
      projects: 5, // the draft project is not in judging
      assignments: 13,
      finished: 1,
      drafts: 1,
      notStarted: 11,
    });
    expect(p.projects.reduce((n, x) => n + x.finished, 0)).toBe(1);
  });
});

describe('CSV exports', () => {
  it('teams: one row per member', async () => {
    const lines = await csv('evt_01', 'teams');
    expect(lines[0]).toBe('team_id,team_name,member_name,member_email,joined_at');
    expect(lines.filter((l) => l.startsWith('tm_01,'))).toHaveLength(3);
  });

  it('submissions: every project with its status and duplicate state', async () => {
    const lines = await csv('evt_01', 'submissions');
    expect(lines[0]).toContain('project_id,title,team_id');
    expect(lines).toHaveLength(42); // header + 41, the held copy included and marked
    expect(lines.find((l) => l.startsWith('prj_07,'))).toMatch(/,true,$/);
  });

  it('assignments: who reviews what, in queue order, and how far they are', async () => {
    const s = await judgedEvent(t, { assigned: true });
    const lines = await csv(s.ev.slug, 'assignments');
    expect(lines[0]).toBe(
      'judge_id,judge_name,project_id,project_title,track,batch,queue_position,state,submitted_at',
    );
    expect(lines).toHaveLength(14); // header + 13
    expect(lines.slice(1).every((l) => l.includes(',NOT_STARTED,'))).toBe(true);
  });
});
