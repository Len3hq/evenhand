/**
 * T2 "a weighted scoring rubric the organizer can configure". Who may change it is in
 * isolation.e2e-spec.ts; this file covers the rules and that the weights really count.
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const organizer = bearer(TOKENS.organizer);
const judgeA = bearer(TOKENS.judge_a);

interface Criterion {
  key?: string;
  label: string;
  weight: number;
  min: number;
  max: number;
}

let t: TestApp;
let seq = 0;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const put = (slug: string, criteria: Criterion[]) =>
  t.http().put(`/api/events/${slug}/criteria`).set(organizer).send({ criteria });
const get = async (slug: string) => (await t.http().get(`/api/events/${slug}/criteria`)).body;

async function newEvent(): Promise<string> {
  const res = await t
    .http()
    .post('/api/events')
    .set(organizer)
    .send({ name: `Rubric ${++seq}`, submissionsClose: '2031-06-01T18:00:00Z' });
  expect(res.status).toBe(201);
  return res.body.slug as string;
}

const FIXTURE = ['functionality', 'quality', 'innovation'].map((key) => ({
  key,
  label: key[0]!.toUpperCase() + key.slice(1),
  weight: 1,
  min: 1,
  max: 5,
}));

describe('setting a rubric before judging', () => {
  it('stores criteria in order, derives keys and reports each share', async () => {
    const slug = await newEvent();
    const res = await put(slug, [
      { label: 'Impact on people', weight: 2, min: 1, max: 5 },
      { label: 'Technical depth', weight: 1, min: 1, max: 5 },
      { key: 'polish', label: 'Polish', weight: 1, min: 0, max: 10 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      locked: false,
      criteria: [
        {
          key: 'impact_on_people',
          label: 'Impact on people',
          weight: 2,
          min: 1,
          max: 5,
          order: 0,
          share: 0.5,
        },
        {
          key: 'technical_depth',
          label: 'Technical depth',
          weight: 1,
          min: 1,
          max: 5,
          order: 1,
          share: 0.25,
        },
        { key: 'polish', label: 'Polish', weight: 1, min: 0, max: 10, order: 2, share: 0.25 },
      ],
    });
    expect(await get(slug)).toEqual(res.body);
  });

  it('can be changed freely until judging starts, and is audited as a sentence', async () => {
    const slug = await newEvent();
    await put(slug, [
      { label: 'Impact', weight: 1, min: 1, max: 5 },
      { label: 'Polish', weight: 1, min: 1, max: 5 },
    ]);
    const res = await put(slug, [
      { label: 'Impact', weight: 3, min: 1, max: 5 },
      { label: 'Novelty', weight: 1, min: 0, max: 10 },
    ]);
    expect(res.status).toBe(200);
    const audit = await t
      .http()
      .get(`/api/events/${slug}/audit`)
      .query({ action: 'rubric.updated' })
      .set(organizer);
    expect(audit.body.items[0].summary).toBe(
      'Demo Organizer changed the rubric: "Impact" weight 1 → 3; added "Novelty" (weight 1, 0–10); removed "Polish"',
    );
  });

  it('writes nothing when nothing changes', async () => {
    const slug = await newEvent();
    const rubric = [{ label: 'Impact', weight: 1, min: 1, max: 5 }];
    await put(slug, rubric);
    await put(slug, rubric);
    const audit = await t
      .http()
      .get(`/api/events/${slug}/audit`)
      .query({ action: 'rubric.updated' })
      .set(organizer);
    expect(audit.body.total).toBe(1);
  });

  it.each([
    ['no criteria', []],
    [
      'two criteria with one key',
      [
        { key: 'a', label: 'A', weight: 1, min: 1, max: 5 },
        { key: 'a', label: 'B', weight: 1, min: 1, max: 5 },
      ],
    ],
    ['a range with min not below max', [{ label: 'A', weight: 1, min: 5, max: 5 }]],
    ['weights that add up to nothing', [{ label: 'A', weight: 0, min: 1, max: 5 }]],
    ['a negative weight', [{ label: 'A', weight: -1, min: 1, max: 5 }]],
    ['a fractional range', [{ label: 'A', weight: 1, min: 1, max: 4.5 }]],
    ['a key that is not a key', [{ key: 'Bad Key', label: 'A', weight: 1, min: 1, max: 5 }]],
    [
      'eleven criteria',
      Array.from({ length: 11 }, (_, i) => ({ label: `C${i}`, weight: 1, min: 1, max: 5 })),
    ],
  ])('refuses %s with 400', async (_, criteria) => {
    const res = await put(await newEvent(), criteria as Criterion[]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_failed');
  });
});

describe('once reviews are final (the fixture event)', () => {
  afterEach(async () => {
    // Put the fixture rubric back: other suites read evt_01's scores.
    expect((await put('evt_01', FIXTURE)).status).toBe(200);
  });

  it('is public and says it is locked', async () => {
    const res = await t.http().get('/api/events/evt_01/criteria');
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.criteria.map((c: { key: string }) => c.key)).toEqual([
      'functionality',
      'quality',
      'innovation',
    ]);
  });

  it('still lets the organiser re-weight, and every weighted score follows', async () => {
    const res = await put(
      'evt_01',
      FIXTURE.map((c) => (c.key === 'functionality' ? { ...c, weight: 2 } : c)),
    );
    expect(res.status).toBe(200);
    expect(res.body.criteria[0].share).toBe(0.5);

    const scores = (await t.http().get('/api/judge/scores').set(judgeA)).body.items as {
      values: Record<string, number>;
      weightedScore: number;
    }[];
    for (const s of scores) {
      const v = s.values;
      expect(s.weightedScore).toBeCloseTo(
        (2 * v.functionality! + v.quality! + v.innovation!) / 4,
        10,
      );
    }
  });

  it.each([
    ['removing a scored criterion', FIXTURE.slice(0, 2), /cannot be removed/],
    [
      'changing a scored range',
      FIXTURE.map((c, i) => (i ? c : { ...c, max: 10 })),
      /range 1–5 is fixed/,
    ],
    [
      'adding a criterion',
      [...FIXTURE, { key: 'novelty', label: 'Novelty', weight: 1, min: 1, max: 5 }],
      /cannot be added/,
    ],
  ])('refuses %s with 409', async (_, criteria, message) => {
    const res = await put('evt_01', criteria as Criterion[]);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('rubric_locked');
    expect(res.body.message).toMatch(message);
  });
});
