/**
 * Events: create, read, edit. Who may do each is in isolation.e2e-spec.ts; this file covers
 * what the routes do (slugs, date rules, audit, the opening time).
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const organizer = bearer(TOKENS.organizer);
const CLOSE = '2031-06-01T18:00:00Z';

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const create = (body: object, as = organizer) => t.http().post('/api/events').set(as).send(body);
const patch = (ref: string, body: object, as = organizer) =>
  t.http().patch(`/api/events/${ref}`).set(as).send(body);

describe('creating an event', () => {
  it('derives the slug, makes the creator its organiser and audits it', async () => {
    const res = await create({ name: 'Autumn Build Week', submissionsClose: CLOSE });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Autumn Build Week',
      slug: 'autumn-build-week',
      opensAt: null,
      submissionsClose: '2031-06-01T18:00:00.000Z',
      judgingClose: null,
      submissionsOpen: true,
    });

    const me = await t.http().get('/api/auth/me').set(organizer);
    expect(me.body.roles).toContainEqual(
      expect.objectContaining({ eventId: res.body.id, role: 'ORGANIZER' }),
    );
    const audit = await t.prisma.auditLog.findMany({ where: { targetId: res.body.id } });
    expect(audit.map((a) => a.action)).toEqual(['event.created']);
  });

  it('counts up when the derived slug is taken', async () => {
    const res = await create({ name: 'Autumn Build Week', submissionsClose: CLOSE });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('autumn-build-week-2');
  });

  it('refuses a chosen slug that is taken with 409', async () => {
    const res = await create({
      name: 'Another',
      slug: 'autumn-build-week',
      submissionsClose: CLOSE,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('slug_taken');
  });

  it.each([
    ['a slug that routes would read as an id', { slug: '01a0e1a2-474e-7562-bfc4-29a9b85023c8' }],
    ['a slug with capitals', { slug: 'Bad-Slug' }],
    ['a date without a time zone', { submissionsClose: '2031-06-01T18:00:00' }],
    ['a date that is not a date', { submissionsClose: 'next friday' }],
    ['an opening after the close', { opensAt: '2031-07-01T00:00:00Z' }],
    ['an opening at the close', { opensAt: CLOSE }],
    ['judging ending before submissions close', { judgingClose: '2031-05-01T00:00:00Z' }],
    ['an unknown field', { resultsPublishedAt: CLOSE }],
  ])('refuses %s with 400', async (_, override) => {
    const res = await create({ name: 'Bad event', submissionsClose: CLOSE, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('accepts other time zones and stores the UTC instant', async () => {
    const res = await create({ name: 'Lagos Hack', submissionsClose: '2031-06-01T19:00:00+01:00' });
    expect(res.status).toBe(201);
    expect(res.body.submissionsClose).toBe('2031-06-01T18:00:00.000Z');
  });
});

describe('reading events (public)', () => {
  it('returns the fixture event by fixture id with its tracks', async () => {
    const res = await t.http().get('/api/events/evt_01');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ externalId: 'evt_01', submissionsOpen: false });
    expect(res.body.tracks).toHaveLength(8);
    expect(res.body.tracks[0]).toMatchObject({ externalId: 'trk_01' });
  });

  it('finds an event by slug, and 404s an unknown one', async () => {
    expect((await t.http().get('/api/events/autumn-build-week')).status).toBe(200);
    const missing = await t.http().get('/api/events/no-such-event');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('not_found');
  });

  it('lists events with paging', async () => {
    const res = await t.http().get('/api/events?pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBeGreaterThanOrEqual(4);
  });
});

describe('editing an event', () => {
  it('changes the name and dates, and audits only what changed', async () => {
    const created = await create({ name: 'Edit Me', submissionsClose: CLOSE });
    const res = await patch(created.body.slug, {
      name: 'Edited',
      judgingClose: '2031-06-10T00:00:00Z',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Edited', slug: 'edit-me' });

    const audit = await t.prisma.auditLog.findFirstOrThrow({
      where: { targetId: created.body.id, action: 'event.updated' },
    });
    expect(audit.before).toEqual({ name: 'Edit Me', judgingClose: null });
    expect(audit.after).toEqual({ name: 'Edited', judgingClose: '2031-06-10T00:00:00.000Z' });
  });

  it('writes no audit row when nothing changes', async () => {
    const created = await create({ name: 'Unchanged', submissionsClose: CLOSE });
    expect((await patch(created.body.id, { name: 'Unchanged' })).status).toBe(200);
    const updates = await t.prisma.auditLog.count({
      where: { targetId: created.body.id, action: 'event.updated' },
    });
    expect(updates).toBe(0);
  });

  it('clears an optional date with null, but never the close', async () => {
    const created = await create({
      name: 'Windowed',
      opensAt: '2031-01-01T00:00:00Z',
      submissionsClose: CLOSE,
    });
    const cleared = await patch(created.body.id, { opensAt: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.opensAt).toBeNull();
    expect((await patch(created.body.id, { submissionsClose: null })).status).toBe(400);
  });

  it('checks the dates after merging the edit with what is stored', async () => {
    const created = await create({
      name: 'Merge Check',
      submissionsClose: CLOSE,
      judgingClose: '2031-06-10T00:00:00Z',
    });
    // Moving the close past the stored judging close would break the order.
    const res = await patch(created.body.id, { submissionsClose: '2031-06-20T00:00:00Z' });
    expect(res.status).toBe(400);
  });

  it('answers 404 for an unknown event to an organiser', async () => {
    expect((await patch('no-such-event', { name: 'x' })).status).toBe(404);
  });

  it('refuses a non-organiser the same way whether or not the event exists', async () => {
    const participant = bearer(TOKENS.participant);
    const real = await patch('evt_01', { name: 'x' }, participant);
    const fake = await patch('no-such-event', { name: 'x' }, participant);
    expect(real.status).toBe(403);
    expect(fake.body).toEqual(real.body);
  });
});

describe('the opening time is enforced, not just shown', () => {
  it('refuses submissions before an event opens', async () => {
    const created = await create({
      name: 'Opens Later',
      opensAt: '2031-01-01T00:00:00Z',
      submissionsClose: CLOSE,
    });
    expect(created.body.submissionsOpen).toBe(false);

    const res = await t
      .http()
      .post(`/api/events/${created.body.slug}/submissions`)
      .set(bearer(TOKENS.participant))
      .send({ title: 'Too early' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('submissions_not_open');
  });
});
