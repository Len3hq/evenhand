/**
 * T1 "project submission with draft and edit until the deadline": read, edit and submit a
 * team's submission. Who may call each route is in isolation.e2e-spec.ts; this file covers
 * what they do. Each test gets a fresh open event, team and draft.
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

async function person(): Promise<Headers> {
  const email = `drafter${++seq}@drafts.test`;
  const res = await t
    .http()
    .post('/api/auth/register')
    .send({ email, name: `Drafter ${seq}`, password: 'long-enough-password' });
  expect(res.status).toBe(201);
  return bearer(await tokenFor(t.prisma, email, `drafts-${seq}`));
}

/** An open event with a two-person team and its draft. */
async function draftSetup() {
  const event = (
    await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({ name: `Drafts test ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' })
  ).body;
  const owner = await person();
  const mate = await person();
  const team = (
    await t
      .http()
      .post(`/api/events/${event.slug}/teams`)
      .set(owner)
      .send({ name: `Drafters ${seq}` })
  ).body;
  const token = (await t.http().post(`/api/teams/${team.id}/invites`).set(owner)).body.token;
  expect((await t.http().post(`/api/invites/${token}`).set(mate)).status).toBe(201);

  const title = `Draft project ${seq}`;
  const draft = await t
    .http()
    .post(`/api/events/${event.slug}/submissions`)
    .set(owner)
    .send({ title });
  expect(draft.status).toBe(201);
  return { event, team, owner, mate, title, id: draft.body.id as string };
}

const get = (id: string, as: Headers) => t.http().get(`/api/submissions/${id}`).set(as);
const patch = (id: string, body: object, as: Headers) =>
  t.http().patch(`/api/submissions/${id}`).set(as).send(body);
const submit = (id: string, as: Headers) => t.http().post(`/api/submissions/${id}/submit`).set(as);
const inGallery = async (eventSlug: string, title: string) =>
  (await t.http().get('/api/projects').query({ event: eventSlug, q: title })).body.total as number;
const audit = (id: string) =>
  t.prisma.auditLog.findMany({ where: { targetId: id }, orderBy: { id: 'asc' } });

describe('reading a draft', () => {
  it('shows the full draft to its team and the organisers, and links it from the team', async () => {
    const s = await draftSetup();
    const own = await get(s.id, s.mate);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({
      id: s.id,
      title: s.title,
      status: 'DRAFT',
      submittedAt: null,
      summary: null,
      techTags: [],
    });
    expect((await get(s.id, organizer)).status).toBe(200);
    expect((await t.http().get(`/api/teams/${s.team.id}`).set(s.owner)).body.submissionId).toBe(
      s.id,
    );
  });

  it('refuses a stranger the same way whether or not the submission exists', async () => {
    const s = await draftSetup();
    const stranger = await person();
    const real = await get(s.id, stranger);
    const fake = await get('00000000-0000-7000-8000-000000000000', stranger);
    expect(real.status).toBe(403);
    expect(fake.body).toEqual(real.body);
  });

  it('keeps drafts out of the public gallery', async () => {
    const s = await draftSetup();
    expect(await inGallery(s.event.slug, s.title)).toBe(0);
  });
});

describe('editing', () => {
  it('lets any team member edit, and audits only what changed', async () => {
    const s = await draftSetup();
    const res = await patch(
      s.id,
      { summary: 'A tool for quiet hours', repoUrl: 'https://example.org/repo', techTags: ['ts'] },
      s.mate,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: s.title,
      summary: 'A tool for quiet hours',
      repoUrl: 'https://example.org/repo',
      techTags: ['ts'],
    });

    const updated = (await audit(s.id)).filter((a) => a.action === 'submission.updated');
    expect(updated).toHaveLength(1);
    expect(updated[0]!.before).toEqual({ summary: null, repoUrl: null, techTags: [] });
    expect(updated[0]!.after).toEqual({
      summary: 'A tool for quiet hours',
      repoUrl: 'https://example.org/repo',
      techTags: ['ts'],
    });
  });

  it('writes nothing when nothing changes, and clears a field with null', async () => {
    const s = await draftSetup();
    await patch(s.id, { tagline: 'Short' }, s.owner);
    expect((await patch(s.id, { tagline: 'Short', techTags: [] }, s.owner)).status).toBe(200);
    const cleared = await patch(s.id, { tagline: null }, s.owner);
    expect(cleared.body.tagline).toBeNull();
    const updates = (await audit(s.id)).filter((a) => a.action === 'submission.updated');
    expect(updates).toHaveLength(2);
  });

  it('moves the project into a track of its own event, and refuses a foreign track', async () => {
    const s = await draftSetup();
    const track = (
      await t.http().post(`/api/events/${s.event.slug}/tracks`).set(organizer).send({ name: 'AI' })
    ).body;
    expect((await patch(s.id, { track: track.id }, s.owner)).body.trackId).toBe(track.id);
    expect((await patch(s.id, { track: 'trk_01' }, s.owner)).status).toBe(400);
    expect((await patch(s.id, { track: null }, s.owner)).body.trackId).toBeNull();
  });

  it.each([
    ['removing the title', { title: null }],
    ['an empty title', { title: '' }],
    ['a link that is not http(s)', { repoUrl: 'javascript:alert(1)' }],
    ['a field that does not exist', { status: 'SUBMITTED' }],
    ['too many tags', { techTags: Array.from({ length: 13 }, (_, i) => `t${i}`) }],
  ])('refuses %s with 400', async (_, body) => {
    const s = await draftSetup();
    const res = await patch(s.id, body, s.owner);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('refuses people who are not on the team, including the organiser', async () => {
    const s = await draftSetup();
    expect((await patch(s.id, { title: 'Hijacked' }, await person())).status).toBe(403);
    expect((await patch(s.id, { title: 'Hijacked' }, organizer)).status).toBe(403);
    expect((await get(s.id, s.owner)).body.title).toBe(s.title);
  });
});

describe('submitting', () => {
  it('needs a summary, then puts the entry in the gallery and audits it', async () => {
    const s = await draftSetup();
    const early = await submit(s.id, s.owner);
    expect(early.status).toBe(400);
    expect(early.body.message).toMatch(/summary/);

    await patch(s.id, { summary: 'Ready to ship' }, s.owner);
    const res = await submit(s.id, s.mate);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(res.body.submittedAt).toEqual(expect.any(String));
    expect(await inGallery(s.event.slug, s.title)).toBe(1);
    expect((await audit(s.id)).map((a) => a.action)).toContain('submission.submitted');
  });

  it('treats a second submit as a no-op that keeps the first submission time', async () => {
    const s = await draftSetup();
    await patch(s.id, { summary: 'Done' }, s.owner);
    const first = (await submit(s.id, s.owner)).body;
    const again = await submit(s.id, s.owner);
    expect(again.status).toBe(200);
    expect(again.body.submittedAt).toBe(first.submittedAt);
    const submits = (await audit(s.id)).filter((a) => a.action === 'submission.submitted');
    expect(submits).toHaveLength(1);
  });

  it('still allows edits after submitting, and the entry stays submitted', async () => {
    const s = await draftSetup();
    await patch(s.id, { summary: 'First version' }, s.owner);
    await submit(s.id, s.owner);
    const res = await patch(s.id, { summary: 'Improved before the deadline' }, s.owner);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'SUBMITTED',
      summary: 'Improved before the deadline',
    });
  });
});

describe('the deadline holds for every write', () => {
  it('refuses edits and submitting after the close, and keeps the last saved version', async () => {
    const s = await draftSetup();
    await patch(s.id, { summary: 'Saved in time' }, s.owner);
    await t.prisma.event.update({
      where: { id: s.event.id },
      data: { submissionsClose: new Date('2020-01-01T00:00:00Z') },
    });

    const late = await patch(s.id, { summary: 'Too late' }, s.owner);
    expect(late.status).toBe(403);
    expect(late.body.error).toBe('submissions_closed');
    expect((await submit(s.id, s.owner)).body.error).toBe('submissions_closed');
    expect((await get(s.id, s.owner)).body.summary).toBe('Saved in time');
  });

  it('refuses edits before the event opens', async () => {
    const s = await draftSetup();
    await t.prisma.event.update({
      where: { id: s.event.id },
      data: { opensAt: new Date('2031-01-01T00:00:00Z') },
    });
    const res = await patch(s.id, { summary: 'Early' }, s.owner);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('submissions_not_open');
  });
});

describe('replaced copies', () => {
  it('refuses edits to a copy held as a suspected duplicate', async () => {
    const s = await draftSetup();
    await t.prisma.submission.update({ where: { id: s.id }, data: { duplicateHold: true } });
    const res = await patch(s.id, { summary: 'Editing the old copy' }, s.owner);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('submission_superseded');
  });
});
