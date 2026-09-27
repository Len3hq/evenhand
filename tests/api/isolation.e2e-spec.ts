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

const LATE_PROBE = { title: 'dogfood-late-submission-probe', summary: 'probe' };

const matrix: {
  name: string;
  method: 'get' | 'post' | 'patch' | 'delete';
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
