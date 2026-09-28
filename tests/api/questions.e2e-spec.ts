/**
 * T1 field set: "organiser-defined custom questions". Who may change them is in
 * isolation.e2e-spec.ts; this file covers the rules, the answers, and who sees which answer.
 */
import { createTestApp, type TestApp } from './helpers.js';
import { type Headers, judgedEvent, organizer, person } from './scenario.js';

interface Question {
  id?: string;
  prompt: string;
  required?: boolean;
  isPublic?: boolean;
}

let t: TestApp;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const put = (slug: string, questions: Question[]) =>
  t.http().put(`/api/events/${slug}/questions`).set(organizer).send({ questions });
const patch = (id: string, as: Headers, body: object) =>
  t.http().patch(`/api/submissions/${id}`).set(as).send(body);
const submit = (id: string, as: Headers) => t.http().post(`/api/submissions/${id}/submit`).set(as);

async function newEvent(): Promise<string> {
  const res = await t
    .http()
    .post('/api/events')
    .set(organizer)
    .send({ name: `Questions ${++seq} ${Date.now()}`, submissionsClose: '2031-06-01T18:00:00Z' });
  expect(res.status).toBe(201);
  return res.body.slug as string;
}

/** A team in the event with a draft (title and summary, so only answers can be missing). */
async function draftIn(slug: string) {
  const maker = await person(t, 'answerer');
  expect(
    (
      await t
        .http()
        .post(`/api/events/${slug}/teams`)
        .set(maker.headers)
        .send({ name: `Answer team ${++seq}` })
    ).status,
  ).toBe(201);
  const res = await t
    .http()
    .post(`/api/events/${slug}/submissions`)
    .set(maker.headers)
    .send({ title: `Answered ${seq}`, summary: 'A project' });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, headers: maker.headers };
}

const audit = async (slug: string, action: string) =>
  (await t.http().get(`/api/events/${slug}/audit`).query({ action }).set(organizer)).body;

describe('setting the questions', () => {
  it('stores them in order, public to read, and audits the change as a sentence', async () => {
    const slug = await newEvent();
    const res = await put(slug, [
      { prompt: '  What did you build this weekend?  ', required: true, isPublic: true },
      { prompt: 'Contact phone number' },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.questions).toEqual([
      expect.objectContaining({
        prompt: 'What did you build this weekend?',
        required: true,
        isPublic: true,
        order: 0,
        externalId: null,
      }),
      expect.objectContaining({
        prompt: 'Contact phone number',
        required: false,
        isPublic: false,
        order: 1,
      }),
    ]);
    const anon = await t.http().get(`/api/events/${slug}/questions`);
    expect(anon.status).toBe(200);
    expect(anon.body).toEqual(res.body);

    const [first, second] = res.body.questions;
    const reorder = await put(
      slug,
      [second, first].map(({ id, prompt, required, isPublic }) => ({
        id,
        prompt,
        required,
        isPublic,
      })),
    );
    expect(reorder.body.questions.map((q: Question) => q.id)).toEqual([second.id, first.id]);

    const trail = await audit(slug, 'questions.updated');
    expect(trail.items.map((i: { summary: string }) => i.summary)).toEqual([
      'Demo Organizer changed the submission questions: reordered the questions',
      'Demo Organizer changed the submission questions: added "What did you build this weekend?" (required, public); added "Contact phone number" (optional, private)',
    ]);
  });

  it('writes nothing when nothing changes', async () => {
    const slug = await newEvent();
    const saved = (await put(slug, [{ prompt: 'Who built it?' }])).body.questions;
    await put(slug, saved);
    expect((await audit(slug, 'questions.updated')).total).toBe(1);
  });

  it.each([
    ['a blank prompt', [{ prompt: '   ' }]],
    ['the same prompt twice', [{ prompt: 'Who?' }, { prompt: 'who?' }]],
    ['an id from nowhere', [{ id: 'q_nowhere', prompt: 'Who?' }]],
    ['a prompt over 300 characters', [{ prompt: 'x'.repeat(301) }]],
    ['21 questions', Array.from({ length: 21 }, (_, i) => ({ prompt: `Q${i}` }))],
    ['a flag that is not a boolean', [{ prompt: 'Who?', required: 'yes' }]],
  ])('refuses %s with 400', async (_, questions) => {
    const res = await put(await newEvent(), questions as Question[]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });

  it('refuses a question of another event', async () => {
    const other = await newEvent();
    const [foreign] = (await put(other, [{ prompt: 'Elsewhere' }])).body.questions;
    const res = await put(await newEvent(), [{ id: foreign.id, prompt: 'Elsewhere' }]);
    expect(res.status).toBe(400);
  });
});

describe('answering', () => {
  it('saves answers with the draft, clears them with null, and audits only what changed', async () => {
    const slug = await newEvent();
    const [build, phone] = (
      await put(slug, [{ prompt: 'What did you build?' }, { prompt: 'Phone' }])
    ).body.questions;
    const team = await draftIn(slug);

    const first = await patch(team.id, team.headers, {
      answers: [
        { question: build.id, value: 'A kite' },
        { question: phone.id, value: '555 0100' },
      ],
    });
    expect(first.status).toBe(200);
    expect(first.body.answers).toEqual([
      { questionId: build.id, value: 'A kite' },
      { questionId: phone.id, value: '555 0100' },
    ]);

    const second = await patch(team.id, team.headers, {
      answers: [
        { question: build.id, value: 'A kite' },
        { question: phone.id, value: null },
      ],
    });
    expect(second.body.answers).toEqual([{ questionId: build.id, value: 'A kite' }]);
    expect(
      (await t.http().get(`/api/submissions/${team.id}`).set(team.headers)).body.answers,
    ).toEqual(second.body.answers);

    const trail = await audit(slug, 'submission.updated');
    expect(trail.items[0].summary).toMatch(/answer 2 \(Phone\): "555 0100" → \(empty\)$/);
    expect(trail.items[0].summary).not.toContain('A kite');
    expect(trail.total).toBe(2);
  });

  it('accepts answers when the draft is created', async () => {
    const slug = await newEvent();
    const [q] = (await put(slug, [{ prompt: 'Why?' }])).body.questions;
    const maker = await person(t, 'creator');
    await t
      .http()
      .post(`/api/events/${slug}/teams`)
      .set(maker.headers)
      .send({ name: `C ${++seq}` });
    const res = await t
      .http()
      .post(`/api/events/${slug}/submissions`)
      .set(maker.headers)
      .send({ title: 'With answers', answers: [{ question: q.id, value: 'Because' }] });
    expect(res.status).toBe(201);
    expect(res.body.answers).toEqual([{ questionId: q.id, value: 'Because' }]);
  });

  it.each([
    ['an unknown question', () => [{ question: 'q_nope', value: 'x' }], /Unknown question/],
    [
      'the same question twice',
      (q: string) => [
        { question: q, value: 'a' },
        { question: q, value: 'b' },
      ],
      /answered twice/,
    ],
    [
      'an answer over 5000 characters',
      (q: string) => [{ question: q, value: 'x'.repeat(5001) }],
      /./,
    ],
    ['a missing value', (q: string) => [{ question: q }], /./],
  ])('refuses %s with 400 and changes nothing', async (_, answers, message) => {
    const slug = await newEvent();
    const [q] = (await put(slug, [{ prompt: 'Why?' }])).body.questions;
    const team = await draftIn(slug);
    const res = await patch(team.id, team.headers, { title: 'Renamed', answers: answers(q.id) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(message);
    const after = (await t.http().get(`/api/submissions/${team.id}`).set(team.headers)).body;
    expect(after.title).not.toBe('Renamed');
    expect(after.answers).toEqual([]);
  });

  it("refuses an answer to another event's question", async () => {
    const other = await newEvent();
    const [foreign] = (await put(other, [{ prompt: 'Elsewhere' }])).body.questions;
    const slug = await newEvent();
    const team = await draftIn(slug);
    const res = await patch(team.id, team.headers, {
      answers: [{ question: foreign.id, value: 'x' }],
    });
    expect(res.status).toBe(400);
  });

  it('only the team can answer', async () => {
    const slug = await newEvent();
    const [q] = (await put(slug, [{ prompt: 'Why?' }])).body.questions;
    const team = await draftIn(slug);
    const stranger = await person(t, 'stranger');
    const res = await patch(team.id, stranger.headers, {
      answers: [{ question: q.id, value: 'x' }],
    });
    expect(res.status).toBe(403);
  });
});

describe('required questions', () => {
  it('a draft may leave them empty; submitting names what is missing', async () => {
    const slug = await newEvent();
    const [q] = (await put(slug, [{ prompt: 'What did you build?', required: true }])).body
      .questions;
    const team = await draftIn(slug);

    const refused = await submit(team.id, team.headers);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe('Add an answer to "What did you build?" before submitting.');

    await patch(team.id, team.headers, { answers: [{ question: q.id, value: 'A kite' }] });
    expect((await submit(team.id, team.headers)).status).toBe(200);
  });

  it('a submitted entry cannot be emptied again, neither its answers nor its summary', async () => {
    const slug = await newEvent();
    const [q] = (await put(slug, [{ prompt: 'What did you build?', required: true }])).body
      .questions;
    const team = await draftIn(slug);
    await patch(team.id, team.headers, { answers: [{ question: q.id, value: 'A kite' }] });
    expect((await submit(team.id, team.headers)).status).toBe(200);

    const cleared = await patch(team.id, team.headers, {
      answers: [{ question: q.id, value: '  ' }],
    });
    expect(cleared.status).toBe(400);
    expect(cleared.body.message).toBe(
      'A submitted entry needs an answer to "What did you build?".',
    );
    const noSummary = await patch(team.id, team.headers, { summary: null });
    expect(noSummary.status).toBe(400);

    const kept = (await t.http().get(`/api/submissions/${team.id}`).set(team.headers)).body;
    expect(kept.summary).toBe('A project');
    expect(kept.answers).toEqual([{ questionId: q.id, value: 'A kite' }]);
    // Rewording an answer is fine.
    const edited = await patch(team.id, team.headers, {
      answers: [{ question: q.id, value: 'A bigger kite' }],
    });
    expect(edited.status).toBe(200);
  });
});

describe('once teams have answered or submitted', () => {
  async function answeredEvent() {
    const slug = await newEvent();
    const [q] = (await put(slug, [{ prompt: 'Who built it?' }])).body.questions;
    const team = await draftIn(slug);
    await patch(team.id, team.headers, { answers: [{ question: q.id, value: 'Ada' }] });
    expect((await submit(team.id, team.headers)).status).toBe(200);
    return { slug, q, team };
  }

  it('keeps an answered question from being removed', async () => {
    const { slug } = await answeredEvent();
    const res = await put(slug, []);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: 'questions_locked',
      message: '"Who built it?" has 1 answer and cannot be removed',
    });
  });

  it('never makes answers given in private public', async () => {
    const { slug, q } = await answeredEvent();
    const res = await put(slug, [{ id: q.id, prompt: q.prompt, isPublic: true }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('questions_locked');
  });

  it('refuses a new required question, or requiring one a submitted entry left empty', async () => {
    const { slug, q } = await answeredEvent();
    const added = await put(slug, [
      { id: q.id, prompt: q.prompt },
      { prompt: 'Phone', required: true },
    ]);
    expect(added.status).toBe(409);
    expect(added.body.message).toBe(
      '"Phone" cannot be added as required: 1 submitted entry has no answer',
    );

    const optional = await put(slug, [{ id: q.id, prompt: q.prompt }, { prompt: 'Phone' }]);
    expect(optional.status).toBe(200);
    const phone = optional.body.questions[1];
    const required = await put(slug, [
      { id: q.id, prompt: q.prompt },
      { id: phone.id, prompt: 'Phone', required: true },
    ]);
    expect(required.status).toBe(409);
  });

  it('allows rewording, requiring an answered question and adding optional ones', async () => {
    const { slug, q } = await answeredEvent();
    const res = await put(slug, [
      { id: q.id, prompt: 'Who built it, and how?', required: true },
      { prompt: 'Anything else?' },
    ]);
    expect(res.status).toBe(200);
    expect((await audit(slug, 'questions.updated')).items[0].summary).toBe(
      'Demo Organizer changed the submission questions: "Who built it?" reworded to "Who built it, and how?", now required; added "Anything else?" (optional, private)',
    );
  });
});

describe('who sees which answer', () => {
  it('the gallery shows public answers only; the judge, the team and organisers see all', async () => {
    const s = await judgedEvent(t, { assigned: true });
    const [open, hidden] = (
      await put(s.ev.slug, [
        { prompt: 'What did you learn?', isPublic: true },
        { prompt: 'Private note to judges' },
      ])
    ).body.questions;
    const maker = s.toolsProject.maker.headers;
    const res = await patch(s.toolsProject.id, maker, {
      answers: [
        { question: hidden.id, value: 'We reused last year’s parser' },
        { question: open.id, value: 'Postgres triggers' },
      ],
    });
    expect(res.status).toBe(200);

    const pub = await t.http().get(`/api/projects/${s.toolsProject.id}`);
    expect(pub.body.answers).toEqual([
      { prompt: 'What did you learn?', value: 'Postgres triggers' },
    ]);
    expect(JSON.stringify(pub.body)).not.toContain('parser');

    const queue = (await t.http().get('/api/judge/queue').set(s.toolsJudge.headers)).body;
    const item = queue.events.find((e: { eventId: string }) => e.eventId === s.ev.id).items[0];
    const review = await t
      .http()
      .get(`/api/judge/reviews/${item.assignmentId}`)
      .set(s.toolsJudge.headers);
    expect(review.body.project.answers).toEqual([
      { prompt: 'What did you learn?', value: 'Postgres triggers' },
      { prompt: 'Private note to judges', value: 'We reused last year’s parser' },
    ]);

    const asOrganizer = await t.http().get(`/api/submissions/${s.toolsProject.id}`).set(organizer);
    expect(asOrganizer.body.answers).toHaveLength(2);
    const asOtherTeam = await t
      .http()
      .get(`/api/submissions/${s.toolsProject.id}`)
      .set(s.gamesProjects[0]!.maker.headers);
    expect(asOtherTeam.status).toBe(403);

    const csv = await t
      .http()
      .get(`/api/events/${s.ev.slug}/export/submissions.csv`)
      .set(organizer);
    const [header, ...rows] = csv.text.trim().split('\n');
    expect(header).toMatch(/,answer: What did you learn\?,answer: Private note to judges$/);
    expect(rows.find((r) => r.includes('Postgres triggers'))).toMatch(
      /,Postgres triggers,We reused last year’s parser$/,
    );
  });
});
