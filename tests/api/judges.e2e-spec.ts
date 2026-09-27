/**
 * T2 "judge invitation": organisers invite judges by link for chosen tracks. Who may call each
 * route is in isolation.e2e-spec.ts; this file covers the rules.
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

async function person(): Promise<{ id: string; email: string; headers: Headers }> {
  const email = `judge${++seq}@judges.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Judge ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return {
    id: res.body.id,
    email,
    headers: bearer(await tokenFor(t.prisma, email, `judges-${seq}`)),
  };
}

/** An open event with two tracks. */
async function eventWithTracks() {
  const event = (
    await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({ name: `Judged ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' })
  ).body;
  const games = (
    await t.http().post(`/api/events/${event.slug}/tracks`).set(organizer).send({ name: 'Games' })
  ).body;
  const tools = (
    await t.http().post(`/api/events/${event.slug}/tracks`).set(organizer).send({ name: 'Tools' })
  ).body;
  return { event, games, tools };
}

const invite = (slug: string, body: object) =>
  t.http().post(`/api/events/${slug}/judge-invites`).set(organizer).send(body);
const accept = (token: string, as: Headers) => t.http().post(`/api/judge-invites/${token}`).set(as);
const judgesOf = async (slug: string) =>
  (await t.http().get(`/api/events/${slug}/judges`).set(organizer)).body as {
    judgeId: string;
    email: string;
    tracks: { name: string }[];
    assigned: number;
    finished: number;
  }[];

describe('inviting a judge', () => {
  it('works end to end: invite, preview, accept, listed with tracks', async () => {
    const { event, games } = await eventWithTracks();
    const res = await invite(event.slug, { tracks: [games.id] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ maxUses: 1, path: `/judge-invites/${res.body.token}` });
    expect(res.body.tracks.map((x: { name: string }) => x.name)).toEqual(['Games']);

    const preview = await t.http().get(`/api/judge-invites/${res.body.token}`);
    expect(preview.body).toMatchObject({ eventSlug: event.slug, tracks: ['Games'], usesLeft: 1 });

    const p = await person();
    const joined = await accept(res.body.token, p.headers);
    expect(joined.status).toBe(201);
    expect(joined.body).toMatchObject({ eventId: event.id, eventSlug: event.slug });

    const me = await t.http().get('/api/auth/me').set(p.headers);
    expect(me.body.roles).toContainEqual(
      expect.objectContaining({ eventId: event.id, role: 'JUDGE' }),
    );
    expect(await judgesOf(event.slug)).toEqual([
      expect.objectContaining({
        email: p.email,
        tracks: [expect.objectContaining({ name: 'Games' })],
        assigned: 0,
        finished: 0,
      }),
    ]);

    const audit = await t
      .http()
      .get(`/api/events/${event.slug}/audit`)
      .query({ action: 'judge.' })
      .set(organizer);
    expect(audit.body.items.map((e: { summary: string }) => e.summary)).toEqual([
      `Judge ${seq} joined as a judge for Games`,
      'Demo Organizer created a judge invite link (1 use) for Games',
    ]);
  });

  it('is used up after its uses (one by default); a panel link admits several', async () => {
    const { event, games } = await eventWithTracks();
    const single = (await invite(event.slug, { tracks: [games.id] })).body.token;
    expect((await accept(single, (await person()).headers)).status).toBe(201);
    const late = await accept(single, (await person()).headers);
    expect(late.status).toBe(410);
    expect(late.body.error).toBe('invite_used_up');

    const panel = (await invite(event.slug, { tracks: [games.id], maxUses: 3 })).body.token;
    for (let i = 0; i < 3; i++)
      expect((await accept(panel, (await person()).headers)).status).toBe(201);
    expect((await accept(panel, (await person()).headers)).status).toBe(410);
  });

  it('needs at least one track when the event has tracks, and only its own', async () => {
    const { event } = await eventWithTracks();
    expect((await invite(event.slug, { tracks: [] })).status).toBe(400);
    expect((await invite(event.slug, { tracks: ['trk_01'] })).status).toBe(400);
  });

  it.each([
    ['someone on a team in the event', 'team'],
    ['an organiser of the event', 'organiser'],
  ])('refuses %s (conflict of interest)', async (_, who) => {
    const { event, games } = await eventWithTracks();
    const token = (await invite(event.slug, { tracks: [games.id], maxUses: 2 })).body.token;
    let as = organizer;
    if (who === 'team') {
      const p = await person();
      await t
        .http()
        .post(`/api/events/${event.slug}/teams`)
        .set(p.headers)
        .send({ name: `T${seq}` });
      as = p.headers;
    }
    const res = await accept(token, as);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict_of_interest');
    // A refusal does not use the link up.
    expect((await t.http().get(`/api/judge-invites/${token}`)).body.usesLeft).toBe(2);
  });

  it('refuses an existing judge', async () => {
    const { event, games } = await eventWithTracks();
    const token = (await invite(event.slug, { tracks: [games.id], maxUses: 2 })).body.token;
    const p = await person();
    await accept(token, p.headers);
    const again = await accept(token, p.headers);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('already_judge');
  });

  it('stops once judging has closed', async () => {
    const { event, games } = await eventWithTracks();
    const token = (await invite(event.slug, { tracks: [games.id] })).body.token;
    await t.prisma.event.update({
      where: { id: event.id },
      data: {
        submissionsClose: new Date('2020-01-01T00:00:00Z'),
        judgingClose: new Date('2020-02-01T00:00:00Z'),
      },
    });
    const res = await accept(token, (await person()).headers);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('judging_closed');
    expect((await invite(event.slug, { tracks: [games.id] })).status).toBe(403);
  });

  it('never lets an invite be used more often than allowed, even by writing to the database', async () => {
    const { event, games } = await eventWithTracks();
    await invite(event.slug, { tracks: [games.id] });
    await expect(
      t.prisma.judgeInvite.updateMany({ where: { eventId: event.id }, data: { uses: 2 } }),
    ).rejects.toThrow(/judge_invites_uses_within_max/);
  });
});

describe('managing judges', () => {
  it('changes the tracks a judge covers, and audits it', async () => {
    const { event, games, tools } = await eventWithTracks();
    const p = await person();
    await accept((await invite(event.slug, { tracks: [games.id] })).body.token, p.headers);
    const [judge] = await judgesOf(event.slug);
    const res = await t
      .http()
      .put(`/api/events/${event.slug}/judges/${judge!.judgeId}/tracks`)
      .set(organizer)
      .send({ tracks: [games.id, tools.id] });
    expect(res.status).toBe(200);
    expect(res.body.tracks.map((x: { name: string }) => x.name)).toEqual(['Games', 'Tools']);
    const audit = await t
      .http()
      .get(`/api/events/${event.slug}/audit`)
      .query({ action: 'judge.tracks_updated' })
      .set(organizer);
    expect(audit.body.items[0].summary).toBe(
      `Demo Organizer changed the tracks "${p.email}" judges: Games → Games, Tools`,
    );
  });

  it('removes a judge who has not reviewed anything', async () => {
    const { event, games } = await eventWithTracks();
    const p = await person();
    await accept((await invite(event.slug, { tracks: [games.id] })).body.token, p.headers);
    const [judge] = await judgesOf(event.slug);
    expect(
      (await t.http().delete(`/api/events/${event.slug}/judges/${judge!.judgeId}`).set(organizer))
        .status,
    ).toBe(204);
    expect(await judgesOf(event.slug)).toEqual([]);
  });

  it('keeps a judge who has reviews, and shows their progress', async () => {
    const res = await t.http().delete('/api/events/evt_01/judges/jdg_24').set(organizer);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('judge_has_reviews');
    const jdg24 = (await judgesOf('evt_01')).find((j) => j.email === 'diego.herrera@example.org');
    expect(jdg24).toMatchObject({ assigned: 11, finished: 11 });
  });
});
