/**
 * An event's tracks and prizes. Who may call each route is in isolation.e2e-spec.ts; this
 * file covers what the routes do. Each test works on a fresh event so they stay independent.
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const organizer = bearer(TOKENS.organizer);

let t: TestApp;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

/** A new event owned by the demo organiser; returns its slug. */
async function newEvent(): Promise<string> {
  const res = await t
    .http()
    .post('/api/events')
    .set(organizer)
    .send({ name: `Setup test ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' });
  expect(res.status).toBe(201);
  return res.body.slug as string;
}

const post = (path: string, body: object) =>
  t.http().post(`/api/events/${path}`).set(organizer).send(body);
const patch = (path: string, body: object) =>
  t.http().patch(`/api/events/${path}`).set(organizer).send(body);
const del = (path: string) => t.http().delete(`/api/events/${path}`).set(organizer);
const eventOf = async (slug: string) => (await t.http().get(`/api/events/${slug}`)).body;
const auditFor = (targetId: string) =>
  t.prisma.auditLog.findMany({ where: { targetId }, orderBy: { id: 'asc' } });

describe('tracks', () => {
  it('adds a track, shows it on the event and audits it', async () => {
    const slug = await newEvent();
    const res = await post(`${slug}/tracks`, { name: 'Climate' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Climate', externalId: null });

    expect((await eventOf(slug)).tracks).toEqual([res.body]);
    expect((await auditFor(res.body.id)).map((a) => a.action)).toEqual(['track.created']);
  });

  it('refuses a second track with the same name in one event, but not in another', async () => {
    const slug = await newEvent();
    expect((await post(`${slug}/tracks`, { name: 'Health' })).status).toBe(201);
    const dup = await post(`${slug}/tracks`, { name: 'Health' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('track_name_taken');
    expect((await post(`${await newEvent()}/tracks`, { name: 'Health' })).status).toBe(201);
  });

  it('renames a track, audits before and after, and ignores a rename to the same name', async () => {
    const slug = await newEvent();
    const track = (await post(`${slug}/tracks`, { name: 'Old' })).body;
    const res = await patch(`${slug}/tracks/${track.id}`, { name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
    expect((await patch(`${slug}/tracks/${track.id}`, { name: 'New' })).status).toBe(200);

    const audit = await auditFor(track.id);
    expect(audit.map((a) => a.action)).toEqual(['track.created', 'track.updated']);
    expect(audit[1]).toMatchObject({ before: { name: 'Old' }, after: { name: 'New' } });
  });

  it('refuses a rename onto another track name', async () => {
    const slug = await newEvent();
    await post(`${slug}/tracks`, { name: 'A' });
    const b = (await post(`${slug}/tracks`, { name: 'B' })).body;
    const res = await patch(`${slug}/tracks/${b.id}`, { name: 'A' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('track_name_taken');
  });

  it('cannot reach a track of another event through this event', async () => {
    const slug = await newEvent();
    expect((await patch(`${slug}/tracks/trk_01`, { name: 'Hijacked' })).status).toBe(404);
    expect((await del(`${slug}/tracks/trk_01`)).status).toBe(404);
  });

  it('deletes an unused track and audits it', async () => {
    const slug = await newEvent();
    const track = (await post(`${slug}/tracks`, { name: 'Short-lived' })).body;
    expect((await del(`${slug}/tracks/${track.id}`)).status).toBe(204);
    expect((await eventOf(slug)).tracks).toEqual([]);
    expect((await auditFor(track.id)).map((a) => a.action)).toEqual([
      'track.created',
      'track.deleted',
    ]);
  });

  it('refuses to delete a track that has submissions and judges, and says what is in it', async () => {
    const res = await del('evt_01/tracks/trk_01');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('track_in_use');
    expect(res.body.message).toMatch(/6 submissions/);
    expect(res.body.message).toMatch(/judge/);
    expect((await eventOf('evt_01')).tracks).toHaveLength(8);
  });

  it('refuses to delete a track that has a prize', async () => {
    const slug = await newEvent();
    const track = (await post(`${slug}/tracks`, { name: 'Prized' })).body;
    await post(`${slug}/prizes`, { name: 'Best in track', track: track.id });
    const res = await del(`${slug}/tracks/${track.id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/1 prize\b/);
  });
});

describe('prizes', () => {
  it('adds an overall prize and a track prize', async () => {
    const slug = await newEvent();
    const track = (await post(`${slug}/tracks`, { name: 'Games' })).body;

    const overall = await post(`${slug}/prizes`, { name: 'Grand prize', description: '$800' });
    expect(overall.status).toBe(201);
    expect(overall.body).toMatchObject({ name: 'Grand prize', description: '$800', trackId: null });

    const perTrack = await post(`${slug}/prizes`, { name: 'Best game', track: track.id });
    expect(perTrack.status).toBe(201);
    expect(perTrack.body.trackId).toBe(track.id);

    const prizes = (await eventOf(slug)).prizes;
    expect(prizes.map((p: { name: string }) => p.name)).toEqual(['Grand prize', 'Best game']);
    expect((await auditFor(overall.body.id)).map((a) => a.action)).toEqual(['prize.created']);
  });

  it('accepts a fixture track id', async () => {
    const res = await post('evt_01/prizes', { name: 'Best developer tool', track: 'trk_01' });
    expect(res.status).toBe(201);
    expect(res.body.trackId).toEqual(expect.any(String));
  });

  it('refuses a track from another event', async () => {
    const slug = await newEvent();
    const res = await post(`${slug}/prizes`, { name: 'Stolen track', track: 'trk_01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('edits a prize, audits only what changed, and ignores an edit that changes nothing', async () => {
    const slug = await newEvent();
    const track = (await post(`${slug}/tracks`, { name: 'Tools' })).body;
    const prize = (await post(`${slug}/prizes`, { name: 'Best tool', track: track.id })).body;

    const res = await patch(`${slug}/prizes/${prize.id}`, { name: 'Best overall', track: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Best overall', trackId: null, description: null });
    expect((await patch(`${slug}/prizes/${prize.id}`, { name: 'Best overall' })).status).toBe(200);

    const audit = await auditFor(prize.id);
    expect(audit.map((a) => a.action)).toEqual(['prize.created', 'prize.updated']);
    expect(audit[1]).toMatchObject({
      before: { name: 'Best tool', trackId: track.id },
      after: { name: 'Best overall', trackId: null },
    });
  });

  it('refuses to remove the name', async () => {
    const slug = await newEvent();
    const prize = (await post(`${slug}/prizes`, { name: 'Named' })).body;
    expect((await patch(`${slug}/prizes/${prize.id}`, { name: null })).status).toBe(400);
  });

  it('deletes a prize and audits it', async () => {
    const slug = await newEvent();
    const prize = (await post(`${slug}/prizes`, { name: 'Gone soon' })).body;
    expect((await del(`${slug}/prizes/${prize.id}`)).status).toBe(204);
    expect((await eventOf(slug)).prizes).toEqual([]);
    expect((await auditFor(prize.id)).map((a) => a.action)).toEqual([
      'prize.created',
      'prize.deleted',
    ]);
  });

  it('cannot reach a prize of another event through this event, and 404s a malformed id', async () => {
    const a = await newEvent();
    const prize = (await post(`${a}/prizes`, { name: 'Mine' })).body;
    const b = await newEvent();
    expect((await patch(`${b}/prizes/${prize.id}`, { name: 'Yours' })).status).toBe(404);
    expect((await del(`${b}/prizes/${prize.id}`)).status).toBe(404);
    expect((await del(`${a}/prizes/not-a-uuid`)).status).toBe(404);
  });
});
