/**
 * Teams and invite links (T1: "team formation by invite link"). Who may call each route is
 * in isolation.e2e-spec.ts; this file covers what they do, including the invite lifecycle.
 * Each test runs in a fresh open event with freshly registered people.
 */
import { hashToken } from '../../src/api/src/core/tokens.js';
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';

const organizer = bearer(TOKENS.organizer);

let t: TestApp;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

/** A newly registered person, with a bearer header. */
async function person(): Promise<{ id: string; headers: Record<string, string> }> {
  const email = `player${++seq}@teams.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Player ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return { id: res.body.id, headers: bearer(await tokenFor(t.prisma, email, `teams-${seq}`)) };
}

/** A new open event (the demo organiser runs it); returns its slug and id. */
async function openEvent(): Promise<{ slug: string; id: string }> {
  const res = await t
    .http()
    .post('/api/events')
    .set(organizer)
    .send({ name: `Teams test ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' });
  expect(res.status).toBe(201);
  return res.body;
}

const createTeam = (slug: string, name: string, as: Record<string, string>) =>
  t.http().post(`/api/events/${slug}/teams`).set(as).send({ name });
const invite = (teamId: string, as: Record<string, string>) =>
  t.http().post(`/api/teams/${teamId}/invites`).set(as);
const join = (token: string, as: Record<string, string>) =>
  t.http().post(`/api/invites/${token}`).set(as);

describe('creating a team', () => {
  it('makes the creator its first member and a participant, and audits it', async () => {
    const event = await openEvent();
    const alice = await person();
    const res = await createTeam(event.slug, 'Nightshift', alice.headers);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Nightshift', eventId: event.id });
    expect(res.body.members).toEqual([expect.objectContaining({ userId: alice.id })]);

    const me = await t.http().get('/api/auth/me').set(alice.headers);
    expect(me.body.roles).toContainEqual(
      expect.objectContaining({ eventId: event.id, role: 'PARTICIPANT' }),
    );
    const audit = await t.prisma.auditLog.findMany({ where: { targetId: res.body.id } });
    expect(audit.map((a) => a.action)).toEqual(['team.created']);
  });

  it('allows one team per person per event', async () => {
    const event = await openEvent();
    const alice = await person();
    await createTeam(event.slug, 'First', alice.headers);
    const res = await createTeam(event.slug, 'Second', alice.headers);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_on_team');
  });

  it('keeps team names unique within an event', async () => {
    const event = await openEvent();
    await createTeam(event.slug, 'Same name', (await person()).headers);
    const res = await createTeam(event.slug, 'Same name', (await person()).headers);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('team_name_taken');
  });

  it("refuses the event's own organisers (conflict of interest)", async () => {
    const event = await openEvent();
    const res = await createTeam(event.slug, 'Organisers united', organizer);
    expect(res.status).toBe(403);
  });

  it('refuses before the event opens', async () => {
    const res = await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({
        name: `Not open yet ${++seq}`,
        opensAt: '2031-01-01T00:00:00Z',
        submissionsClose: '2031-06-01T18:00:00Z',
      });
    const early = await createTeam(res.body.slug, 'Early birds', (await person()).headers);
    expect(early.status).toBe(403);
    expect(early.body.error).toBe('submissions_not_open');
  });
});

describe('invite links', () => {
  it('works end to end: invite, preview, join', async () => {
    const event = await openEvent();
    const alice = await person();
    const bob = await person();
    const team = (await createTeam(event.slug, 'Quiet Hours', alice.headers)).body;

    const inv = await invite(team.id, alice.headers);
    expect(inv.status).toBe(201);
    expect(inv.body).toMatchObject({ maxUses: 4, path: `/invites/${inv.body.token}` });

    // Only the hash is stored.
    const stored = await t.prisma.invite.findFirstOrThrow({ where: { teamId: team.id } });
    expect(stored.tokenHash).toBe(hashToken(inv.body.token));
    expect(stored.tokenHash).not.toContain(inv.body.token);

    const preview = await t.http().get(`/api/invites/${inv.body.token}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      teamName: 'Quiet Hours',
      eventSlug: event.slug,
      usesLeft: 4,
    });
    expect(JSON.stringify(preview.body)).not.toContain('@');

    const joined = await join(inv.body.token, bob.headers);
    expect(joined.status).toBe(201);
    expect(joined.body.members.map((m: { userId: string }) => m.userId)).toEqual([
      alice.id,
      bob.id,
    ]);
    expect((await t.http().get(`/api/invites/${inv.body.token}`)).body.usesLeft).toBe(3);

    const audit = await t.prisma.auditLog.findMany({
      where: { targetId: team.id },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['team.created', 'invite.created', 'team.joined']);
    expect(JSON.stringify(audit.map((a) => a.after))).not.toContain(inv.body.token);
  });

  it('lets members, not others, see the team', async () => {
    const event = await openEvent();
    const alice = await person();
    const team = (await createTeam(event.slug, 'Private', alice.headers)).body;
    expect((await t.http().get(`/api/teams/${team.id}`).set(alice.headers)).status).toBe(200);
    expect((await t.http().get(`/api/teams/${team.id}`).set(organizer)).status).toBe(200);
    // Register first: supertest starts and stops the server per request, so a request must
    // not be built while another one is still in flight.
    const stranger = await person();
    expect((await t.http().get(`/api/teams/${team.id}`).set(stranger.headers)).status).toBe(403);
  });

  it('only lets members create invites', async () => {
    const event = await openEvent();
    const team = (await createTeam(event.slug, 'Closed shop', (await person()).headers)).body;
    expect((await invite(team.id, (await person()).headers)).status).toBe(403);
  });

  it('refuses someone already on a team in the event, without using up the invite', async () => {
    const event = await openEvent();
    const alice = await person();
    const bob = await person();
    const team = (await createTeam(event.slug, 'Team A', alice.headers)).body;
    await createTeam(event.slug, 'Team B', bob.headers);
    const token = (await invite(team.id, alice.headers)).body.token;

    const res = await join(token, bob.headers);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_on_team');
    expect((await t.http().get(`/api/invites/${token}`)).body.usesLeft).toBe(4);
  });

  it('answers 410 once the link is used up', async () => {
    const event = await openEvent();
    const alice = await person();
    const team = (await createTeam(event.slug, 'Tiny', alice.headers)).body;
    const token = (await invite(team.id, alice.headers)).body.token;
    await t.prisma.invite.updateMany({ where: { teamId: team.id }, data: { maxUses: 1 } });

    expect((await join(token, (await person()).headers)).status).toBe(201);
    const late = await join(token, (await person()).headers);
    expect(late.status).toBe(410);
    expect(late.body.error).toBe('invite_used_up');
    expect((await t.http().get(`/api/invites/${token}`)).status).toBe(410);
  });

  it('answers 410 once the link has expired', async () => {
    const event = await openEvent();
    const alice = await person();
    const team = (await createTeam(event.slug, 'Expiring', alice.headers)).body;
    const token = (await invite(team.id, alice.headers)).body.token;
    await t.prisma.invite.updateMany({
      where: { teamId: team.id },
      data: { expiresAt: new Date('2020-01-01T00:00:00Z') },
    });

    const res = await join(token, (await person()).headers);
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('invite_expired');
  });

  it('answers 404 for a link that never existed', async () => {
    expect((await t.http().get('/api/invites/not-a-real-token')).status).toBe(404);
    expect((await join('not-a-real-token', (await person()).headers)).status).toBe(404);
  });

  it('stops joining once the event closes, even with a valid link', async () => {
    const event = await openEvent();
    const alice = await person();
    const team = (await createTeam(event.slug, 'Frozen', alice.headers)).body;
    const token = (await invite(team.id, alice.headers)).body.token;
    await t.prisma.event.update({
      where: { id: event.id },
      data: { submissionsClose: new Date('2020-01-01T00:00:00Z') },
    });

    const res = await join(token, (await person()).headers);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('submissions_closed');
    expect((await invite(team.id, alice.headers)).status).toBe(403);
  });

  it("refuses the event's judges", async () => {
    const event = await openEvent();
    const alice = await person();
    const judge = await person();
    const role = await t.prisma.eventRole.create({
      data: { userId: judge.id, eventId: event.id, role: 'JUDGE' },
    });
    try {
      const team = (await createTeam(event.slug, 'No judges', alice.headers)).body;
      const token = (await invite(team.id, alice.headers)).body.token;
      expect((await join(token, judge.headers)).status).toBe(403);
    } finally {
      // Suites share the database, and seed.e2e-spec.ts counts every judge role.
      await t.prisma.eventRole.delete({ where: { id: role.id } });
    }
  });
});

describe('the new team can submit', () => {
  it('lets a member of a team formed by invite create the team submission', async () => {
    const event = await openEvent();
    const alice = await person();
    const bob = await person();
    const team = (await createTeam(event.slug, 'Shippers', alice.headers)).body;
    await join((await invite(team.id, alice.headers)).body.token, bob.headers);

    const res = await t
      .http()
      .post(`/api/events/${event.slug}/submissions`)
      .set(bob.headers)
      .send({ title: 'Built by invite' });
    expect(res.status).toBe(201);
    expect(res.body.teamId).toBe(team.id);
  });
});
