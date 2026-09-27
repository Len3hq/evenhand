import type { ScoredReview } from './normalize.js';

/**
 * The methods the joint model is measured against in the Normalization Proof. Pure.
 */

/** Each project's plain mean score. */
export function rawMeans(reviews: readonly ScoredReview[]): Map<string, number> {
  return meanBy(
    reviews,
    (r) => r.projectId,
    (r) => r.score,
  );
}

/**
 * Per-judge z-scores: (score − judge's mean) / judge's standard deviation, averaged per project.
 * A judge whose scores do not vary (SD 0, like fixture jdg_07) has no z-score at all: their
 * reviews are dropped, and `dropped` lists them. This is the method's weakness, not a bug.
 */
export function zScores(reviews: readonly ScoredReview[]): {
  scores: Map<string, number>;
  dropped: string[];
} {
  const stats = new Map<string, { mean: number; sd: number }>();
  for (const [judge, list] of groupBy(reviews, (r) => r.judgeId)) {
    const m = list.reduce((s, r) => s + r.score, 0) / list.length;
    const sd = Math.sqrt(list.reduce((s, r) => s + (r.score - m) ** 2, 0) / list.length);
    stats.set(judge, { mean: m, sd });
  }
  const dropped = [...stats]
    .filter(([, s]) => s.sd < 1e-9)
    .map(([j]) => j)
    .sort();
  const usable = reviews.filter((r) => stats.get(r.judgeId)!.sd >= 1e-9);
  const scores = meanBy(
    usable,
    (r) => r.projectId,
    (r) => (r.score - stats.get(r.judgeId)!.mean) / stats.get(r.judgeId)!.sd,
  );
  return { scores, dropped };
}

/** Spearman rank correlation of two equally long lists (average ranks for ties). */
export function spearman(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length < 2)
    throw new RangeError('need two lists of equal length ≥ 2');
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i]! - ma) * (rb[i]! - mb);
    va += (ra[i]! - ma) ** 2;
    vb += (rb[i]! - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

function ranks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    for (let k = i; k <= j; k++) out[order[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

function meanBy<T>(
  xs: readonly T[],
  key: (x: T) => string,
  value: (x: T) => number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, list] of groupBy(xs, key)) {
    out.set(k, list.reduce((s, x) => s + value(x), 0) / list.length);
  }
  return out;
}
