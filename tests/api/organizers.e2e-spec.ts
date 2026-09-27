/**
 * Appointing and removing an event's organisers. Who may call each route is in
 * isolation.e2e-spec.ts; this file covers the rules.
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
  const email = `org${++seq}@organizers.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Candidate ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return { id: res.body.id, email, headers: bearer(await tokenFor(t.prisma, email, `org-${seq}`)) };
}

/** A new open event; the demo organiser is its only organiser. */
async function event(): Promise<{ id: string; slug: string }> {
  const res = await t
    .http()
    .post('/api/events')
    .set(organizer)
    .send({ name: `Organised ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' });
  expect(res.status).toBe(201);
  return res.body;
}

const add = (slug: string, email: string, as: Headers = organizer) =>
  t.http().post(`/api/events/${slug}/organizers`).set(as).send({ email });
const remove = (slug: string, userId: string, as: Headers = organizer) =>
  t.http().delete(`/api/events/${slug}/organizers/${userId}`).set(as);
const list = async (slug: string) =>
  (await t.http().get(`/api/events/${slug}/organizers`).set(organizer)).body as {
    userId: string;
    email: string;
  }[];

describe('appointing organisers', () => {
  it('makes an existing account an organiser who can then manage the event', async () => {
    const e = await event();
    const p = await person();
    expect(
      (await t.http().patch(`/api/events/${e.slug}`).set(p.headers).send({ name: 'x' })).status,
    ).toBe(403);

    const res = await add(e.slug, p.email.toUpperCase());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ userId: p.id, email: p.email });
    expect((await list(e.slug)).map((o) => o.email)).toEqual(['organizer@evenhand.local', p.email]);

    const renamed = await t
      .http()
      .patch(`/api/events/${e.slug}`)
      .set(p.headers)
      .send({ name: 'Renamed' });
    expect(renamed.status).toBe(200);

    const audit = await t
      .http()
      .get(`/api/events/${e.slug}/audit`)
      .query({ action: 'organizer.' })
      .set(organizer);
    expect(audit.body.items[0].summary).toBe(`Demo Organizer made "${p.email}" an organiser`);
  });

  it('refuses someone who already organises the event', async () => {
    const e = await event();
    const res = await add(e.slug, 'organizer@evenhand.local');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_organizer');
  });

  it('refuses an email nobody has registered, saying so', async () => {
    const e = await event();
    const res = await add(e.slug, 'nobody@organizers.test');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(
      'No account uses nobody@organizers.test. Ask them to register first.',
    );
  });

  it('refuses someone on a team in the event (they would see every score)', async () => {
    const e = await event();
    const p = await person();
    await t
      .http()
      .post(`/api/events/${e.slug}/teams`)
      .set(p.headers)
      .send({ name: `Team ${seq}` });
    const res = await add(e.slug, p.email);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('conflict_of_interest');
  });

  it("refuses one of the event's judges", async () => {
    const e = await event();
    const p = await person();
    const role = await t.prisma.eventRole.create({
      data: { userId: p.id, eventId: e.id, role: 'JUDGE' },
    });
    try {
      const res = await add(e.slug, p.email);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/judges in this event/);
    } finally {
      // Suites share the database, and seed.e2e-spec.ts counts every judge role.
      await t.prisma.eventRole.delete({ where: { id: role.id } });
    }
  });
});

describe('removing organisers', () => {
  it('never removes the last one', async () => {
    const e = await event();
    const me = (await list(e.slug))[0]!;
    const res = await remove(e.slug, me.userId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('last_organizer');
  });

  it('removes an organiser, who then loses access, and audits it', async () => {
    const e = await event();
    const p = await person();
    await add(e.slug, p.email);
    expect((await remove(e.slug, p.id)).status).toBe(204);
    expect((await list(e.slug)).map((o) => o.email)).toEqual(['organizer@evenhand.local']);
    expect(
      (await t.http().patch(`/api/events/${e.slug}`).set(p.headers).send({ name: 'x' })).status,
    ).toBe(403);
    const audit = await t
      .http()
      .get(`/api/events/${e.slug}/audit`)
      .query({ action: 'organizer.removed' })
      .set(organizer);
    expect(audit.body.items[0].summary).toBe(`Demo Organizer removed "${p.email}" as an organiser`);
  });

  it('lets an organiser step down while someone else stays', async () => {
    const e = await event();
    const p = await person();
    await add(e.slug, p.email);
    expect((await remove(e.slug, p.id, p.headers)).status).toBe(204);
  });

  it('answers 404 for someone who is not an organiser of the event', async () => {
    const e = await event();
    const p = await person();
    expect((await remove(e.slug, p.id)).status).toBe(404);
  });
});
