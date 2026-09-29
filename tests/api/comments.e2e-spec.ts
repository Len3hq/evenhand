/**
 * Comments on public projects (T3): who may post, who may moderate, what visitors see, and that
 * moderation is reversible, rate limited and audited.
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';
import { organizer, person } from './scenario.js';

const PROJECT = 'prj_01'; // Glass Signal, in the fixture event the demo organiser runs

let t: TestApp;
let commenter: Awaited<ReturnType<typeof person>>;
let stamp: string;
beforeAll(async () => {
  t = await createTestApp();
  commenter = await person(t, 'commenter');
  stamp = String(Date.now());
});
afterAll(() => t.close());

const list = (headers: Record<string, string> = {}, ref = PROJECT) =>
  t.http().get(`/api/projects/${ref}/comments`).set(headers);
const post = (headers: Record<string, string>, body: string, ref = PROJECT) =>
  t.http().post(`/api/projects/${ref}/comments`).set(headers).send({ body });

describe('posting', () => {
  let commentId: string;

  it('lets anyone logged in comment on a public project, and anyone read it', async () => {
    expect((await post({}, 'Nice work')).status).toBe(401);

    const res = await post(commenter.headers, `  Lovely demo ${stamp}  `);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      author: { name: commenter.name },
      body: `Lovely demo ${stamp}`,
      hidden: false,
      hideReason: null,
    });
    commentId = res.body.id;

    const visitor = await list();
    expect(visitor.status).toBe(200);
    expect(visitor.body.map((c: { id: string }) => c.id)).toContain(commentId);
    // Authors are shown by name only.
    expect(JSON.stringify(visitor.body)).not.toContain(commenter.email);
  });

  it('refuses empty and overlong comments', async () => {
    expect((await post(commenter.headers, '   ')).status).toBe(400);
    expect((await post(commenter.headers, 'x'.repeat(2001))).status).toBe(400);
  });

  it('has no comments for a project that is not public (404, as the gallery)', async () => {
    const maker = await person(t, 'drafter');
    const ev = await t
      .http()
      .post('/api/events')
      .set(organizer)
      .send({ name: `Comments ${stamp}`, submissionsClose: '2031-06-01T18:00:00Z' });
    await t
      .http()
      .post(`/api/events/${ev.body.slug}/teams`)
      .set(maker.headers)
      .send({ name: 'Drafts' });
    const draft = await t
      .http()
      .post(`/api/events/${ev.body.slug}/submissions`)
      .set(maker.headers)
      .send({ title: 'Not yet', summary: 'Draft' });
    expect((await list({}, draft.body.id)).status).toBe(404);
    expect((await post(maker.headers, 'Me first', draft.body.id)).status).toBe(404);
  });

  it('records the comment in the event audit trail', async () => {
    const res = await t
      .http()
      .get('/api/events/evt_01/audit')
      .query({ action: 'comment.posted', actor: commenter.email })
      .set(organizer);
    expect(res.body.items[0].summary).toBe(`${commenter.name} commented on "Glass Signal"`);
  });

  describe('moderation', () => {
    it('is refused to anyone but the event’s organisers, before a lookup for non-organisers', async () => {
      for (const headers of [
        commenter.headers,
        bearer(TOKENS.participant),
        bearer(TOKENS.judge_b),
      ]) {
        for (const id of [commentId, '0190a1b2-0000-7000-8000-000000000000']) {
          const res = await t
            .http()
            .post(`/api/comments/${id}/hide`)
            .set(headers)
            .send({ reason: 'Spam' });
          expect(res.status).toBe(403);
        }
      }
    });

    it('hides a comment with a reason: gone for visitors, marked for organisers', async () => {
      const res = await t
        .http()
        .post(`/api/comments/${commentId}/hide`)
        .set(organizer)
        .send({ reason: 'Off topic' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ hidden: true, hideReason: 'Off topic' });

      const visitor = await list();
      expect(visitor.body.map((c: { id: string }) => c.id)).not.toContain(commentId);
      const author = await list(commenter.headers);
      expect(author.body.map((c: { id: string }) => c.id)).not.toContain(commentId);
      const moderator = await list(organizer);
      expect(moderator.body.find((c: { id: string }) => c.id === commentId)).toMatchObject({
        hidden: true,
        hideReason: 'Off topic',
      });

      const again = await t
        .http()
        .post(`/api/comments/${commentId}/hide`)
        .set(organizer)
        .send({ reason: 'Again' });
      expect(again.status).toBe(409);
      expect(again.body.error).toBe('comment_already_hidden');
    });

    it('restores it, and says so when it is not hidden', async () => {
      const res = await t.http().post(`/api/comments/${commentId}/restore`).set(organizer);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ hidden: false, hideReason: null });
      expect((await list()).body.map((c: { id: string }) => c.id)).toContain(commentId);

      const again = await t.http().post(`/api/comments/${commentId}/restore`).set(organizer);
      expect(again.status).toBe(409);
      expect(again.body.error).toBe('comment_not_hidden');
    });

    it('audits hiding with its reason, and restoring', async () => {
      const res = await t
        .http()
        .get('/api/events/evt_01/audit')
        .query({ action: 'comment.' })
        .set(organizer);
      const sentences = res.body.items.map((i: { summary: string }) => i.summary);
      expect(sentences).toContain('Demo Organizer hid a comment on "Glass Signal": Off topic');
      expect(sentences).toContain('Demo Organizer restored a hidden comment on "Glass Signal"');
    });
  });
});

describe('the comment rate limit', () => {
  it('refuses posts over RATE_LIMIT_COMMENT_PER_MIN with 429', async () => {
    const limited = await createTestApp({ config: { rateLimitCommentPerMin: 1 } });
    try {
      const send = () =>
        limited
          .http()
          .post(`/api/projects/${PROJECT}/comments`)
          .set(commenter.headers)
          .send({ body: 'Hi' });
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
