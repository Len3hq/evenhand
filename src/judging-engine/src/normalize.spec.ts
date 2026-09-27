import { describe, expect, it } from 'vitest';
import { rawMeans, spearman, zScores } from './baselines.js';
import { normalize, type ScoredReview, tieGroups } from './normalize.js';
import { syntheticEvent } from './synthetic.js';

const r = (judgeId: string, projectId: string, score: number): ScoredReview => ({
  judgeId,
  projectId,
  score,
});
const project = (res: ReturnType<typeof normalize>, id: string) =>
  res.projects.find((p) => p.projectId === id)!;
const judge = (res: ReturnType<typeof normalize>, id: string) =>
  res.judges.find((j) => j.judgeId === id)!;

describe('normalize', () => {
  it('separates project quality from judge leniency (worked by hand)', () => {
    // Judge A is 2 points more generous than B; project p1 is 1 point better than p2.
    const res = normalize([r('A', 'p1', 5), r('A', 'p2', 4), r('B', 'p1', 3), r('B', 'p2', 2)], {
      lambdaB: 1e-6,
      lambdaQ: 1e-6,
    });
    expect(project(res, 'p1').normalized - project(res, 'p2').normalized).toBeCloseTo(1, 5);
    expect(judge(res, 'A').bias - judge(res, 'B').bias).toBeCloseTo(2, 5);
    expect(res.mu).toBeCloseTo(3.5, 5);
  });

  it('does not reward a project for drawing a generous judge', () => {
    // p1 and p2 are equally good; only p1 was reviewed by the generous judge G.
    const reviews = [
      r('G', 'p1', 5),
      r('G', 'p3', 4),
      r('N', 'p1', 3),
      r('N', 'p2', 3),
      r('N', 'p3', 2),
      r('M', 'p2', 3),
      r('M', 'p3', 2),
    ];
    const res = normalize(reviews, { lambdaB: 0.1, lambdaQ: 0.1 });
    const raw = rawMeans(reviews);
    expect(raw.get('p1')! - raw.get('p2')!).toBeCloseTo(1, 10); // raw means favour p1 by a point
    expect(project(res, 'p1').normalized - project(res, 'p2').normalized).toBeLessThan(0.5);
    expect(judge(res, 'G').bias).toBeGreaterThan(0.5);
  });

  it('copes with a judge who gives every project the same score (no division by zero)', () => {
    const reviews = [
      r('flat', 'p1', 4),
      r('flat', 'p2', 4),
      r('flat', 'p3', 4),
      r('a', 'p1', 5),
      r('a', 'p2', 3),
      r('b', 'p2', 3),
      r('b', 'p3', 1),
    ];
    const res = normalize(reviews);
    for (const p of res.projects) expect(Number.isFinite(p.normalized)).toBe(true);
    // z-scores cannot use that judge at all.
    expect(zScores(reviews).dropped).toEqual(['flat']);
  });

  it('is less sure about a project with fewer reviews', () => {
    const reviews = [
      r('a', 'few', 4),
      ...['a', 'b', 'c', 'd', 'e'].map((j) => r(j, 'many', 4)),
      ...['b', 'c', 'd', 'e'].map((j) => r(j, 'other', 3)),
    ];
    const res = normalize(reviews, { lambdaB: 1, lambdaQ: 1 });
    expect(project(res, 'few').sd).toBeGreaterThan(project(res, 'many').sd);
  });

  it('gives the same answer whatever order the reviews arrive in', () => {
    const ev = syntheticEvent({ seed: 5 });
    const a = normalize(ev.reviews);
    const b = normalize([...ev.reviews].reverse());
    expect(b.projects).toEqual(a.projects);
    expect(b.lambdaB).toBe(a.lambdaB);
  });

  it('computes leave-one-out error exactly, as if refitted without each review', () => {
    const reviews = syntheticEvent({
      seed: 9,
      tracks: 2,
      projectsPerTrack: 4,
      judgesPerTrack: 3,
      bridgeJudges: 1,
    }).reviews;
    const lambda = { lambdaB: 0.7, lambdaQ: 0.3 };
    const shortcut = normalize(reviews, lambda).looMse;
    let brute = 0;
    reviews.forEach((left, i) => {
      const rest = normalize(
        reviews.filter((_, k) => k !== i),
        lambda,
      );
      const q = rest.projects.find((p) => p.projectId === left.projectId);
      const b = rest.judges.find((j) => j.judgeId === left.judgeId);
      // A project or judge seen only in the left-out review has q = b = 0 in the refit.
      const predicted = (q ? q.normalized : rest.mu) + (b ? b.bias : 0);
      brute += (left.score - predicted) ** 2;
    });
    expect(shortcut).toBeCloseTo(brute / reviews.length, 9);
  });

  it('chooses λ from the grid by leave-one-out error and reports the whole curve', () => {
    const res = normalize(syntheticEvent({ seed: 3 }).reviews);
    expect(res.curve).toHaveLength(100);
    const best = Math.min(...res.curve.map((c) => c.looMse));
    expect(res.looMse).toBeCloseTo(best, 12);
  });

  it('says when the chosen λ sits on the edge of the grid', () => {
    const reviews = syntheticEvent({ seed: 3 }).reviews;
    expect(normalize(reviews, { grid: [8, 16] }).atEdge).toBe(true);
    const wide = normalize(reviews);
    expect(wide.atEdge).toBe([wide.lambdaB, wide.lambdaQ].some((l) => l === 0.125 || l === 64));
  });

  it('reports how well the overall mean alone predicts a review, for comparison', () => {
    const res = normalize([r('a', 'p', 2), r('b', 'p', 4), r('c', 'q', 3)], {
      lambdaB: 1,
      lambdaQ: 1,
    });
    // Leaving out 2, 4, 3 in turn, the others average 3.5, 2.5, 3: errors 1.5², 1.5², 0².
    expect(res.meanOnlyLooMse).toBeCloseTo((2.25 + 2.25 + 0) / 3, 12);
  });

  it('refuses no reviews and non-positive penalties', () => {
    expect(() => normalize([])).toThrow(RangeError);
    expect(() => normalize([r('a', 'p', 3)], { lambdaB: 0, lambdaQ: 1 })).toThrow(RangeError);
  });
});

describe('the synthetic recovery test (decision 52)', () => {
  /** 20 seeded events with a known truth: 40 projects in 5 tracks, 30 judges, 3 reviews each. */
  const runs = Array.from({ length: 20 }, (_, i) => {
    const ev = syntheticEvent({ seed: i + 1 });
    const ids = [...ev.quality.keys()];
    const truth = ids.map((id) => ev.quality.get(id)!);
    const joint = new Map(normalize(ev.reviews).projects.map((p) => [p.projectId, p.normalized]));
    const raw = rawMeans(ev.reviews);
    const z = zScores(ev.reviews).scores;
    return {
      joint: spearman(
        ids.map((id) => joint.get(id)!),
        truth,
      ),
      raw: spearman(
        ids.map((id) => raw.get(id)!),
        truth,
      ),
      z: spearman(
        ids.map((id) => z.get(id)!),
        truth,
      ),
    };
  });
  const mean = (k: 'joint' | 'raw' | 'z') => runs.reduce((s, x) => s + x[k], 0) / runs.length;

  it('recovers the true ranking: mean Spearman ρ above 0.9', () => {
    expect(mean('joint')).toBeGreaterThan(0.9);
  });

  it('beats raw means and per-judge z-scores on average', () => {
    expect(mean('joint')).toBeGreaterThan(mean('raw'));
    expect(mean('joint')).toBeGreaterThan(mean('z'));
  });

  it('beats raw means in most events and z-scores in every one', () => {
    expect(runs.filter((x) => x.joint > x.raw).length).toBeGreaterThanOrEqual(16);
    expect(runs.every((x) => x.joint > x.z)).toBe(true);
  });
});

describe('tieGroups', () => {
  it('groups projects within one pooled SD of the group leader, without chaining', () => {
    // Gaps of 0.4 with SD 0.5: neighbours are all "close", but 3.2 is 0.8 from the leader.
    const ranked = [4.0, 3.6, 3.2, 2.8, 1.0].map((normalized) => ({ normalized, sd: 0.5 }));
    expect(tieGroups(ranked)).toEqual([1, 1, 2, 2, 3]);
  });
});
