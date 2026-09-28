/**
 * Role isolation matrix (BUILD-PLAN §1.3, §10; the "judges cannot see each other's work" rule).
 * Every row is actor × route → expected status. Add a row for every new protected endpoint.
 * These run against the real app and database: this is what "survives a curl" means.
 */
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';

type Actor =
  'anon' | 'participant' | 'judge_a' | 'judge_b' | 'organizer' | 'admin' | 'otherOrganizer';

let t: TestApp;
const headers: Record<Actor, Record<string, string>> = {
  anon: {},
  participant: bearer(TOKENS.participant),
  judge_a: bearer(TOKENS.judge_a),
  judge_b: bearer(TOKENS.judge_b),
  organizer: bearer(TOKENS.organizer),
  admin: {},
  otherOrganizer: {},
};

beforeAll(async () => {
  t = await createTestApp();
  headers.admin = bearer(await tokenFor(t.prisma, 'admin@evenhand.local', 'admin'));

  // An organiser of the *demo* event only: must not see the fixture event's judges.
  const demo = await t.prisma.event.findUniqueOrThrow({ where: { slug: 'evenhand-demo' } });
  const other = await t.prisma.user.upsert({
    where: { email: 'other-organizer@evenhand.local' },
    create: { email: 'other-organizer@evenhand.local', name: 'Other Organizer' },
    update: {},
  });
  await t.prisma.eventRole.createMany({
    data: [{ userId: other.id, eventId: demo.id, role: 'ORGANIZER' }],
    skipDuplicates: true,
  });
  headers.otherOrganizer = bearer(await tokenFor(t.prisma, other.email, 'other-organizer'));
});

afterAll(() => t.close());

/** The rubric fixtures.json implies: its three score keys, equal weights, 1–5. */
const FIXTURE_RUBRIC = ['functionality', 'quality', 'innovation'].map((key) => ({
  key,
  label: key[0]!.toUpperCase() + key.slice(1),
  weight: 1,
  min: 1,
  max: 5,
}));

const LATE_PROBE = { title: 'dogfood-late-submission-probe', summary: 'probe' };

const matrix: {
  name: string;
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  body?: object;
  expect: Record<Actor, number>;
}[] = [
  {
    name: 'public gallery (check 1)',
    method: 'get',
    path: '/api/projects',
    expect: {
      anon: 200,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: 'late submission to the closed fixture event (check 3)',
    method: 'post',
    path: '/api/events/evt_01/submissions',
    body: LATE_PROBE,
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'own scores (checks 4 and 6)',
    method: 'get',
    path: '/api/judge/scores',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 200,
      judge_b: 200,
      organizer: 403,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: "judge_a's scores by fixture id (check 5)",
    method: 'get',
    path: '/api/judges/jdg_24/scores',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 200,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'a judge that does not exist (no existence leak to non-organisers)',
    method: 'get',
    path: '/api/judges/jdg_does_not_exist/scores',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'scores CSV export (check 7)',
    method: 'get',
    path: '/api/events/evt_01/export/scores.csv',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'one event, with tracks and prizes (public)',
    method: 'get',
    path: '/api/events/evt_01',
    expect: {
      anon: 200,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: 'create an event (admins and organisers)',
    method: 'post',
    path: '/api/events',
    body: { name: 'Matrix probe', submissionsClose: '2030-01-01T00:00:00Z' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 201,
      admin: 201,
      otherOrganizer: 201,
    },
  },
  {
    name: 'edit the fixture event (its organisers and admins; an unchanged name writes nothing)',
    method: 'patch',
    path: '/api/events/evt_01',
    body: { name: 'Sample Hack 2026' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'add a prize to the fixture event',
    method: 'post',
    path: '/api/events/evt_01/prizes',
    body: { name: 'Matrix prize' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 201,
      admin: 201,
      otherOrganizer: 403,
    },
  },
  {
    name: 'rename a fixture track (to its own name: writes nothing)',
    method: 'patch',
    path: '/api/events/evt_01/tracks/trk_01',
    body: { name: 'Developer tools' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'delete a prize that does not exist (403 before any lookup for non-organisers)',
    method: 'delete',
    path: '/api/events/evt_01/prizes/00000000-0000-7000-8000-000000000000',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'a fixture team (its members, its organisers, admins)',
    method: 'get',
    path: '/api/teams/tm_01',
    expect: {
      anon: 401,
      participant: 200,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'a team that does not exist (403, not 404, unless admin)',
    method: 'get',
    path: '/api/teams/tm_does_not_exist',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'form a team in the closed fixture event (teams freeze at the deadline)',
    method: 'post',
    path: '/api/events/evt_01/teams',
    body: { name: 'Too late' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'invite to a fixture team (members only; the event is closed anyway)',
    method: 'post',
    path: '/api/teams/tm_01/invites',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'one public project',
    method: 'get',
    path: '/api/projects/prj_01',
    expect: {
      anon: 200,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: 'list events (public)',
    method: 'get',
    path: '/api/events',
    expect: {
      anon: 200,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: 'add a track whose name is taken (organisers reach the 409; nothing is written)',
    method: 'post',
    path: '/api/events/evt_01/tracks',
    body: { name: 'Developer tools' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 409,
      admin: 409,
      otherOrganizer: 403,
    },
  },
  {
    name: 'delete a track that is in use (organisers reach the 409; nothing is deleted)',
    method: 'delete',
    path: '/api/events/evt_01/tracks/trk_01',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 409,
      admin: 409,
      otherOrganizer: 403,
    },
  },
  {
    name: 'edit a prize that does not exist',
    method: 'patch',
    path: '/api/events/evt_01/prizes/00000000-0000-7000-8000-000000000000',
    body: { name: 'x' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'preview an unknown invite (public)',
    method: 'get',
    path: '/api/invites/not-a-real-token',
    expect: {
      anon: 404,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'join with an unknown invite (any logged-in user)',
    method: 'post',
    path: '/api/invites/not-a-real-token',
    expect: {
      anon: 401,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'a fixture submission (its team, its organisers, admins)',
    method: 'get',
    path: '/api/submissions/prj_01',
    expect: {
      anon: 401,
      participant: 200,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'a submission that does not exist (403, not 404, unless admin)',
    method: 'get',
    path: '/api/submissions/prj_does_not_exist',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'edit a fixture submission (its team is refused too: the event is closed)',
    method: 'patch',
    path: '/api/submissions/prj_01',
    body: { title: 'Edited late' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'submit a fixture submission after the deadline',
    method: 'post',
    path: '/api/submissions/prj_01/submit',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: "the fixture event's audit trail (its organisers and admins)",
    method: 'get',
    path: '/api/events/evt_01/audit',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: "the fixture event's audit trail as CSV",
    method: 'get',
    path: '/api/events/evt_01/export/audit.csv',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'platform audit: logins and accounts, with addresses (admins only)',
    method: 'get',
    path: '/api/audit',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'export the whole fixture event as JSON (its organisers and admins)',
    method: 'get',
    path: '/api/events/evt_01/export.json',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'my own teams (any logged-in user; only ever their own)',
    method: 'get',
    path: '/api/me/teams',
    expect: {
      anon: 401,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: "the fixture event's organisers",
    method: 'get',
    path: '/api/events/evt_01/organizers',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'appoint an organiser with an email nobody uses',
    method: 'post',
    path: '/api/events/evt_01/organizers',
    body: { email: 'nobody@nowhere.test' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'remove an organiser who is not one',
    method: 'delete',
    path: '/api/events/evt_01/organizers/00000000-0000-7000-8000-000000000000',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'the fixture rubric (public, so teams know how they are judged)',
    method: 'get',
    path: '/api/events/evt_01/criteria',
    expect: {
      anon: 200,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: 'replace the fixture rubric with itself (organisers and admins; writes nothing)',
    method: 'put',
    path: '/api/events/evt_01/criteria',
    body: { criteria: FIXTURE_RUBRIC },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'the fixture event questions (public, so teams know what they are asked)',
    method: 'get',
    path: '/api/events/evt_01/questions',
    expect: {
      anon: 200,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
  {
    name: 'replace the fixture event questions with none (organisers and admins; writes nothing)',
    method: 'put',
    path: '/api/events/evt_01/questions',
    body: { questions: [] },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'create a judge invite for the fixture event',
    method: 'post',
    path: '/api/events/evt_01/judge-invites',
    body: { tracks: ['trk_01'] },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 201,
      admin: 201,
      otherOrganizer: 403,
    },
  },
  {
    name: 'preview an unknown judge invite (public)',
    method: 'get',
    path: '/api/judge-invites/not-a-real-token',
    expect: {
      anon: 404,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'accept an unknown judge invite (any logged-in user)',
    method: 'post',
    path: '/api/judge-invites/not-a-real-token',
    expect: {
      anon: 401,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: "the fixture event's judges and their progress",
    method: 'get',
    path: '/api/events/evt_01/judges',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: "set jdg_24's tracks to what they are (writes nothing)",
    method: 'put',
    path: '/api/events/evt_01/judges/jdg_24/tracks',
    body: { tracks: ['trk_01', 'trk_07'] },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'remove a judge who has reviews (organisers reach the 409; nothing is removed)',
    method: 'delete',
    path: '/api/events/evt_01/judges/jdg_24',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 409,
      admin: 409,
      otherOrganizer: 403,
    },
  },
  {
    name: 'run assignment on the fixture event with target 1 (every project has that: adds nothing)',
    method: 'post',
    path: '/api/events/evt_01/assignments/run',
    body: { target: 1 },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'my judging queue (judges; admins pass the role gate and see an empty queue)',
    method: 'get',
    path: '/api/judge/queue',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 200,
      judge_b: 200,
      organizer: 403,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'a review that is not yours (the same 403 whether or not it exists)',
    method: 'get',
    path: '/api/judge/reviews/00000000-0000-7000-8000-000000000000',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: "the fixture event's live judging progress",
    method: 'get',
    path: '/api/events/evt_01/progress',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'teams CSV',
    method: 'get',
    path: '/api/events/evt_01/export/teams.csv',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'submissions CSV',
    method: 'get',
    path: '/api/events/evt_01/export/submissions.csv',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'assignments CSV',
    method: 'get',
    path: '/api/events/evt_01/export/assignments.csv',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'rank the fixture event (organisers and admins; the event is never published in tests)',
    method: 'post',
    path: '/api/events/evt_01/rankings',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 201,
      admin: 201,
      otherOrganizer: 403,
    },
  },
  {
    name: "the fixture event's ranking runs",
    method: 'get',
    path: '/api/events/evt_01/rankings',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'results CSV (the newest run, since nothing is published)',
    method: 'get',
    path: '/api/events/evt_01/export/results.csv',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'public results before publishing: 404 for everyone',
    method: 'get',
    path: '/api/events/evt_01/results',
    expect: {
      anon: 404,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'a ranking that does not exist (403 before any lookup for non-organisers)',
    method: 'get',
    path: '/api/rankings/00000000-0000-7000-8000-000000000000',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'publish a ranking that does not exist',
    method: 'post',
    path: '/api/rankings/00000000-0000-7000-8000-000000000000/publish',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'submitted entries with their standing (organisers of the event and admins)',
    method: 'get',
    path: '/api/events/evt_01/submissions',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'suspected duplicates of the event',
    method: 'get',
    path: '/api/events/evt_01/duplicates',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 200,
      admin: 200,
      otherOrganizer: 403,
    },
  },
  {
    name: 'confirm a duplicate that does not exist',
    method: 'post',
    path: '/api/duplicates/00000000-0000-7000-8000-000000000000/confirm',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'dismiss a duplicate that does not exist',
    method: 'post',
    path: '/api/duplicates/00000000-0000-7000-8000-000000000000/dismiss',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'reopen a duplicate that does not exist',
    method: 'post',
    path: '/api/duplicates/00000000-0000-7000-8000-000000000000/reopen',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'disqualify a submission that does not exist (403 unless admin: drafts cannot be probed)',
    method: 'post',
    path: '/api/submissions/00000000-0000-7000-8000-000000000000/disqualify',
    body: { reason: 'isolation probe' },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 404,
      otherOrganizer: 403,
    },
  },
  {
    name: 'reinstate a fixture entry that is not disqualified (no change)',
    method: 'post',
    path: '/api/submissions/prj_01/reinstate',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 409,
      admin: 409,
      otherOrganizer: 403,
    },
  },
  {
    name: 'upload an image to a submission that is not yours (refused before the upload is read)',
    method: 'post',
    path: '/api/submissions/00000000-0000-7000-8000-000000000000/images',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'remove an image from a submission that is not yours',
    method: 'delete',
    path: '/api/submissions/00000000-0000-7000-8000-000000000000/images/00000000-0000-7000-8000-000000000000',
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'reorder the images of a submission that is not yours',
    method: 'put',
    path: '/api/submissions/00000000-0000-7000-8000-000000000000/images/order',
    body: { order: [] },
    expect: {
      anon: 401,
      participant: 403,
      judge_a: 403,
      judge_b: 403,
      organizer: 403,
      admin: 403,
      otherOrganizer: 403,
    },
  },
  {
    name: 'an image that does not exist',
    method: 'get',
    path: '/api/images/00000000-0000-7000-8000-000000000000',
    expect: {
      anon: 404,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'the thumbnail of an image that does not exist',
    method: 'get',
    path: '/api/images/00000000-0000-7000-8000-000000000000/thumb',
    expect: {
      anon: 404,
      participant: 404,
      judge_a: 404,
      judge_b: 404,
      organizer: 404,
      admin: 404,
      otherOrganizer: 404,
    },
  },
  {
    name: 'who am I',
    method: 'get',
    path: '/api/auth/me',
    expect: {
      anon: 401,
      participant: 200,
      judge_a: 200,
      judge_b: 200,
      organizer: 200,
      admin: 200,
      otherOrganizer: 200,
    },
  },
];

describe.each(matrix)('$name — $method $path', ({ method, path, body, expect: expected }) => {
  it.each(Object.entries(expected) as [Actor, number][])('%s → %i', async (actor, status) => {
    const req = t.http()[method](path).set(headers[actor]);
    const res = await (body ? req.send(body) : req);
    expect(res.status).toBe(status);
    if (status >= 400) {
      // Never a redirect, always the JSON error shape.
      expect(res.body).toMatchObject({
        statusCode: status,
        error: expect.any(String),
        message: expect.any(String),
      });
    }
  });
});

describe('what each role actually sees', () => {
  it("judge_a's own scores contain only judge_a's reviews", async () => {
    const res = await t.http().get('/api/judge/scores').set(headers.judge_a);
    expect(res.body.items).toHaveLength(11);
    expect(
      new Set(res.body.items.map((s: { judge: { externalId: string } }) => s.judge.externalId)),
    ).toEqual(new Set(['jdg_24']));
  });

  it('refuses judge_b before looking anything up: same answer for a real and a fake judge', async () => {
    const real = await t.http().get('/api/judges/jdg_24/scores').set(headers.judge_b);
    const fake = await t.http().get('/api/judges/jdg_nope/scores').set(headers.judge_b);
    expect(real.status).toBe(403);
    expect(fake.body).toEqual(real.body);
  });

  it('the late probe is refused for the deadline, not for its body', async () => {
    const res = await t
      .http()
      .post('/api/events/evt_01/submissions')
      .set(headers.participant)
      .send({ nonsense: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('submissions_closed');
  });
});
