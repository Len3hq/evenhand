/**
 * Deadline enforcement with a frozen clock, including the exact boundary instant
 * (BUILD-PLAN decision 30: accept only if now < submissions_close, server time).
 */
import { FixedClock } from '../../src/api/src/core/clock.js';
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
let t: TestApp;
let fixtureClose: Date;
let demoClose: Date;

beforeAll(async () => {
  t = await createTestApp({ clock });
  fixtureClose = (await t.prisma.event.findUniqueOrThrow({ where: { externalId: 'evt_01' } }))
    .submissionsClose;
  demoClose = (await t.prisma.event.findUniqueOrThrow({ where: { slug: 'evenhand-demo' } }))
    .submissionsClose;
});
afterAll(() => t.close());

const submit = (event: string, body: object) =>
  t.http().post(`/api/events/${event}/submissions`).set(bearer(TOKENS.participant)).send(body);

describe('the fixture event (closes 2026-03-01T18:00Z)', () => {
  it('is refused at the exact closing instant', async () => {
    clock.set(fixtureClose);
    const res = await submit('evt_01', { title: 'On the dot' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('submissions_closed');
  });

  it('gets past the deadline one millisecond earlier (then hits the one-per-team rule)', async () => {
    clock.set(new Date(fixtureClose.getTime() - 1));
    const res = await submit('evt_01', { title: 'Just in time' });
    // priya1's team already has prj_01 live, so the next rule answers: 409, not 403.
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('team_already_has_submission');
  });
});

describe('the open demo event', () => {
  it('rejects an invalid body with 400 while open', async () => {
    clock.set(new Date(demoClose.getTime() - 60_000));
    const res = await submit('evenhand-demo', { title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('creates a draft while open, and writes an audit row', async () => {
    clock.set(new Date(demoClose.getTime() - 60_000));
    const res = await submit('evenhand-demo', {
      title: 'Demo project',
      summary: 'Made in the test suite',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Demo project', status: 'DRAFT' });
    const audit = await t.prisma.auditLog.findFirst({
      where: { action: 'submission.created', targetId: res.body.id },
    });
    expect(audit).not.toBeNull();
  });

  it('refuses a second submission from the same team', async () => {
    const res = await submit('evenhand-demo', { title: 'Another one' });
    expect(res.status).toBe(409);
  });

  it('refuses a user who is not on a team in that event', async () => {
    clock.set(new Date(demoClose.getTime() - 60_000));
    const res = await t
      .http()
      .post('/api/events/evenhand-demo/submissions')
      .set(bearer(TOKENS.judge_a))
      .send({ title: 'Judge trying to submit' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('not_a_team_member');
  });

  it('closes on time too', async () => {
    clock.set(demoClose);
    const res = await submit('evenhand-demo', { title: 'Too late' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('submissions_closed');
  });
});
