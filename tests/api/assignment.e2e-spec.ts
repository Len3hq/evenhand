/**
 * T2 "judge assignment": the engine's greedy, track-matched, least-loaded assignment, run by an
 * organiser against a real event. The algorithm itself is unit-tested in the judging engine.
 */
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';

const organizer = bearer(TOKENS.organizer);
type Headers = Record<string, string>;

let t: TestApp;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

async function person(): Promise<{ id: string; headers: Headers }> {
  const email = `assign${++seq}@assignment.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Person ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return { id: res.body.id, headers: bearer(await tokenFor(t.prisma, email, `assign-${seq}`)) };
}

/**
 * An event with a Games track (4 judges, 4 submitted projects), a Tools track (1 judge,
 * 1 project) and one team whose project is still a draft.
 */
async function event() {
  const ev = (
    await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({ name: `Assigned ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' })
  ).body;
  const track = async (name: string) =>
    (await t.http().post(`/api/events/${ev.slug}/tracks`).set(organizer).send({ name })).body
      .id as string;
  const games = await track('Games');
  const tools = await track('Tools');

  const judge = async (trackId: string) => {
    const p = await person();
    const inv = (
      await t
        .http()
        .post(`/api/events/${ev.slug}/judge-invites`)
        .set(organizer)
        .send({ tracks: [trackId] })
    ).body;
    const joined = await t.http().post(`/api/judge-invites/${inv.token}`).set(p.headers);
    expect(joined.status).toBe(201);
    return joined.body.judgeId as string;
  };
  const gamesJudges = [
    await judge(games),
    await judge(games),
    await judge(games),
    await judge(games),
  ];
  const toolsJudge = await judge(tools);

  const project = async (trackId: string, submit = true) => {
    const p = await person();
    const team = (
      await t
        .http()
        .post(`/api/events/${ev.slug}/teams`)
        .set(p.headers)
        .send({ name: `Team ${seq}` })
    ).body;
    const sub = (
      await t
        .http()
        .post(`/api/events/${ev.slug}/submissions`)
        .set(p.headers)
        .send({ title: `Project ${seq}`, summary: 'Something', track: trackId })
    ).body;
    if (submit)
      expect((await t.http().post(`/api/submissions/${sub.id}/submit`).set(p.headers)).status).toBe(
        200,
      );
    return { id: sub.id as string, teamId: team.id as string };
  };
  const gamesProjects = [
    await project(games),
    await project(games),
    await project(games),
    await project(games),
  ];
  const toolsProject = await project(tools);
  const draft = await project(games, false);
  return { ev, games, tools, gamesJudges, toolsJudge, gamesProjects, toolsProject, draft };
}

const run = (slug: string, body: object = {}) =>
  t.http().post(`/api/events/${slug}/assignments/run`).set(organizer).send(body);
const assignmentsOf = (eventId: string) =>
  t.prisma.assignment.findMany({
    where: { judgeRole: { eventId } },
    select: { judgeRoleId: true, submissionId: true, queuePosition: true, batch: true },
  });

describe('running assignment', () => {
  it('gives each project 3 judges from its own track, and reports what it could not do', async () => {
    const e = await event();
    const res = await run(e.ev.slug, { seed: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ seed: 7, target: 3, projects: 5, added: 13 });
    expect(res.body.shortfalls).toEqual([
      { projectId: e.toolsProject.id, title: expect.any(String), have: 1, eligibleJudges: 1 },
    ]);

    const rows = await assignmentsOf(e.ev.id);
    for (const p of e.gamesProjects) {
      const judges = rows.filter((r) => r.submissionId === p.id).map((r) => r.judgeRoleId);
      expect(judges).toHaveLength(3);
      expect(judges.every((j) => e.gamesJudges.includes(j))).toBe(true);
    }
    expect(
      rows.filter((r) => r.submissionId === e.toolsProject.id).map((r) => r.judgeRoleId),
    ).toEqual([e.toolsJudge]);
    // The draft is not judged.
    expect(rows.some((r) => r.submissionId === e.draft.id)).toBe(false);
    // 12 Games reviews over 4 Games judges: 3 each.
    for (const j of e.gamesJudges) expect(rows.filter((r) => r.judgeRoleId === j)).toHaveLength(3);
  });

  it('numbers each judge’s queue 0, 1, 2…', async () => {
    const e = await event();
    await run(e.ev.slug);
    const rows = await assignmentsOf(e.ev.id);
    for (const j of e.gamesJudges) {
      const positions = rows
        .filter((r) => r.judgeRoleId === j)
        .map((r) => r.queuePosition)
        .sort();
      expect(positions).toEqual([0, 1, 2]);
    }
  });

  it('only tops up: running again adds nothing and keeps the existing work', async () => {
    const e = await event();
    await run(e.ev.slug);
    const before = await assignmentsOf(e.ev.id);
    const again = await run(e.ev.slug);
    expect(again.body.added).toBe(0);
    expect(await assignmentsOf(e.ev.id)).toEqual(before);
  });

  it('never pairs a judge with a team they have a conflict with', async () => {
    const e = await event();
    const [judge] = e.gamesJudges;
    const [project] = e.gamesProjects;
    await t.prisma.conflictOfInterest.create({
      data: { judgeRoleId: judge!, teamId: project!.teamId },
    });
    await run(e.ev.slug);
    const rows = await assignmentsOf(e.ev.id);
    expect(rows.some((r) => r.judgeRoleId === judge && r.submissionId === project!.id)).toBe(false);
    expect(rows.filter((r) => r.submissionId === project!.id)).toHaveLength(3);
  });

  it('shows up in the judges list and reads as a sentence in the audit trail', async () => {
    const e = await event();
    await run(e.ev.slug, { seed: 11 });
    const judges = (await t.http().get(`/api/events/${e.ev.slug}/judges`).set(organizer)).body;
    expect(judges.map((j: { assigned: number }) => j.assigned).sort()).toEqual([1, 3, 3, 3, 3]);
    const audit = await t
      .http()
      .get(`/api/events/${e.ev.slug}/audit`)
      .query({ action: 'assignment.run' })
      .set(organizer);
    expect(audit.body.items[0].summary).toBe(
      'Demo Organizer ran assignment (3 reviews per project, seed 11): 13 new assignments; 1 project cannot reach the target',
    );
  });

  it('stops once judging has closed', async () => {
    const e = await event();
    await t.prisma.event.update({
      where: { id: e.ev.id },
      data: {
        submissionsClose: new Date('2020-01-01T00:00:00Z'),
        judgingClose: new Date('2020-02-01T00:00:00Z'),
      },
    });
    const res = await run(e.ev.slug);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('judging_closed');
  });

  it('refuses a target outside 1–10', async () => {
    const e = await event();
    expect((await run(e.ev.slug, { target: 0 })).status).toBe(400);
    expect((await run(e.ev.slug, { target: 11 })).status).toBe(400);
  });
});
