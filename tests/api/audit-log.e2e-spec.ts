/**
 * "An audit trail an organizer can actually read" (spec, Judging Integrity). Who may read
 * which trail is in isolation.e2e-spec.ts; this file covers what the trail says.
 */
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';

const organizer = bearer(TOKENS.organizer);
type Headers = Record<string, string>;
interface Entry {
  id: string;
  action: string;
  summary: string;
  target: string | null;
  actor: { email: string; name: string } | null;
}

let t: TestApp;
let admin: Headers;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
  admin = bearer(await tokenFor(t.prisma, 'admin@evenhand.local', 'audit-admin'));
});
afterAll(() => t.close());

async function person(): Promise<{ email: string; headers: Headers }> {
  const email = `audited${++seq}@audit.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Audited ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return { email, headers: bearer(await tokenFor(t.prisma, email, `audit-${seq}`)) };
}

/** An event with a known history: created, deadline moved, a track added and removed, a team. */
async function eventWithHistory() {
  const name = `Audited event ${++seq}`;
  const event = (
    await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({ name, submissionsClose: '2031-06-01T18:00:00Z' })
  ).body;
  await t
    .http()
    .patch(`/api/events/${event.slug}`)
    .set(organizer)
    .send({ submissionsClose: '2031-06-08T18:00:00Z' });
  const track = (
    await t.http().post(`/api/events/${event.slug}/tracks`).set(organizer).send({ name: 'Doomed' })
  ).body;
  await t.http().delete(`/api/events/${event.slug}/tracks/${track.id}`).set(organizer);
  const player = await person();
  const team = (
    await t
      .http()
      .post(`/api/events/${event.slug}/teams`)
      .set(player.headers)
      .send({ name: 'Readable Team' })
  ).body;
  const invite = (await t.http().post(`/api/teams/${team.id}/invites`).set(player.headers)).body;
  return { event, name, player, team, token: invite.token as string };
}

const trail = async (slug: string, query: Record<string, string | number> = {}) => {
  const res = await t.http().get(`/api/events/${slug}/audit`).query(query).set(organizer);
  expect(res.status).toBe(200);
  return res.body as { items: Entry[]; total: number };
};

describe("an event's trail", () => {
  it('reads as sentences, newest first, naming people and things', async () => {
    const h = await eventWithHistory();
    const { items } = await trail(h.event.slug);
    expect(items.map((e) => e.action)).toEqual([
      'invite.created',
      'team.created',
      'track.deleted',
      'track.created',
      'event.updated',
      'event.created',
    ]);
    expect(items.map((e) => e.summary)).toEqual([
      `Audited ${seq} created an invite link for the team "Readable Team"`,
      `Audited ${seq} created the team "Readable Team"`,
      'Demo Organizer removed the track "Doomed"',
      'Demo Organizer added the track "Doomed"',
      'Demo Organizer changed the event: submissionsClose: 2031-06-01 18:00 UTC → 2031-06-08 18:00 UTC',
      `Demo Organizer created the event "${h.name}"`,
    ]);
  });

  it('never shows secrets: no invite token, no password hash, no IP address', async () => {
    const h = await eventWithHistory();
    const res = await t.http().get(`/api/events/${h.event.slug}/audit`).set(organizer);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(h.token);
    expect(body).not.toMatch(/argon2|tokenHash|passwordHash/);
    expect(res.body.items[0]).not.toHaveProperty('ip');
  });

  it('only contains this event', async () => {
    const a = await eventWithHistory();
    const b = await eventWithHistory();
    const { items } = await trail(a.event.slug);
    expect(items.some((e) => e.summary.includes(b.name))).toBe(false);
  });

  it('filters by action, action group, actor and target', async () => {
    const h = await eventWithHistory();
    expect((await trail(h.event.slug, { action: 'event.updated' })).total).toBe(1);
    expect((await trail(h.event.slug, { action: 'track.' })).total).toBe(2);
    const mine = await trail(h.event.slug, { actor: h.player.email.toUpperCase() });
    expect(mine.items.map((e) => e.action)).toEqual(['invite.created', 'team.created']);
    expect((await trail(h.event.slug, { target: h.team.id })).total).toBe(2);
    expect((await trail(h.event.slug, { actor: 'nobody@nowhere.test' })).total).toBe(0);
  });

  it('refuses a malformed action filter with 400', async () => {
    const h = await eventWithHistory();
    const res = await t
      .http()
      .get(`/api/events/${h.event.slug}/audit`)
      .query({ action: "x'; drop table" })
      .set(organizer);
    expect(res.status).toBe(400);
  });

  it('pages', async () => {
    const h = await eventWithHistory();
    const page2 = await trail(h.event.slug, { pageSize: 4, page: 2 });
    expect(page2.total).toBe(6);
    expect(page2.items.map((e) => e.action)).toEqual(['event.updated', 'event.created']);
  });
});

describe('the CSV export', () => {
  it('has a header, one row per entry oldest first, and the readable summary', async () => {
    const h = await eventWithHistory();
    const res = await t.http().get(`/api/events/${h.event.slug}/export/audit.csv`).set(organizer);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe(
      'id,at,actor_email,actor_name,action,target_type,target_id,target,summary,before,after',
    );
    expect(lines).toHaveLength(7);
    expect(lines[1]).toContain('event.created');
    expect(lines[6]).toContain('invite.created');
  });

  it('neutralises a team name written as a spreadsheet formula', async () => {
    const event = (
      await t
        .http()
        .post('/api/events')
        .set(organizer)
        .send({ name: `CSV injection ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' })
    ).body;
    const player = await person();
    await t
      .http()
      .post(`/api/events/${event.slug}/teams`)
      .set(player.headers)
      .send({ name: '=HYPERLINK("http://evil.test","click")' });
    const csv = (await t.http().get(`/api/events/${event.slug}/export/audit.csv`).set(organizer))
      .text;
    // The target column holds the team name; it must not start a formula.
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"",""click"")"`);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });
});

describe('the platform trail (admins)', () => {
  it('shows logins and accounts, with addresses, and nothing from events', async () => {
    const p = await person();
    const res = await t
      .http()
      .get('/api/audit')
      .query({ actor: p.email, action: 'auth.' })
      .set(admin);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({
        action: 'auth.registered',
        summary: `Audited ${seq} created an account`,
        ip: expect.any(String),
      }),
    ]);
    const all = await t.http().get('/api/audit').query({ pageSize: 100 }).set(admin);
    expect(all.body.items.every((e: Entry) => !e.action.startsWith('event.'))).toBe(true);
  });
});
