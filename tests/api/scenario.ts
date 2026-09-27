/**
 * Builds realistic events through the API itself, for suites that need a judged event: tracks,
 * judges who joined by invite link, teams that submitted. Every call goes through the same
 * routes and rules a browser would use.
 */
import { bearer, type TestApp, TOKENS, tokenFor } from './helpers.js';

export type Headers = Record<string, string>;
export const organizer = bearer(TOKENS.organizer);

let seq = 0;

/** A newly registered person with a bearer header. */
export async function person(t: TestApp, label = 'person') {
  const email = `${label}${++seq}-${Date.now()}@scenario.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `${label} ${seq}`, password: 'long-enough-password' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
  return {
    id: res.body.id as string,
    email,
    name: `${label} ${seq}`,
    headers: bearer(await tokenFor(t.prisma, email, `${label}-${seq}-${Date.now()}`)),
  };
}

/**
 * An open event with a Games track (4 judges, 4 submitted projects), a Tools track (1 judge,
 * 1 submitted project) and one team whose project is still a draft. `assigned` also runs
 * assignment (target 3, a fixed seed).
 */
export async function judgedEvent(t: TestApp, opts: { assigned?: boolean } = {}) {
  const ev = (
    await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({ name: `Scenario ${++seq} ${Date.now()}`, submissionsClose: '2031-06-01T18:00:00Z' })
  ).body as { id: string; slug: string };
  await t
    .http()
    .put(`/api/events/${ev.slug}/criteria`)
    .set(organizer)
    .send({
      criteria: [
        { key: 'impact', label: 'Impact', weight: 2, min: 1, max: 5 },
        { key: 'polish', label: 'Polish', weight: 1, min: 1, max: 5 },
      ],
    });
  const track = async (name: string) =>
    (await t.http().post(`/api/events/${ev.slug}/tracks`).set(organizer).send({ name })).body
      .id as string;
  const games = await track('Games');
  const tools = await track('Tools');

  const judge = async (trackId: string) => {
    const p = await person(t, 'judge');
    const inv = (
      await t
        .http()
        .post(`/api/events/${ev.slug}/judge-invites`)
        .set(organizer)
        .send({ tracks: [trackId] })
    ).body;
    const joined = await t.http().post(`/api/judge-invites/${inv.token}`).set(p.headers);
    if (joined.status !== 201) throw new Error(`judge join failed: ${joined.status}`);
    return { ...p, judgeId: joined.body.judgeId as string };
  };
  const gamesJudges = [
    await judge(games),
    await judge(games),
    await judge(games),
    await judge(games),
  ];
  const toolsJudge = await judge(tools);

  const project = async (trackId: string, submit = true) => {
    const p = await person(t, 'maker');
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
    if (submit) await t.http().post(`/api/submissions/${sub.id}/submit`).set(p.headers);
    return { id: sub.id as string, teamId: team.id as string, maker: p };
  };
  const gamesProjects = [
    await project(games),
    await project(games),
    await project(games),
    await project(games),
  ];
  const toolsProject = await project(tools);
  const draft = await project(games, false);

  if (opts.assigned) {
    const run = await t
      .http()
      .post(`/api/events/${ev.slug}/assignments/run`)
      .set(organizer)
      .send({ seed: 7 });
    if (run.status !== 200) throw new Error(`assignment failed: ${run.status}`);
  }
  return { ev, games, tools, gamesJudges, toolsJudge, gamesProjects, toolsProject, draft };
}
