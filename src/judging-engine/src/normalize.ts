import { choleskyInverse, cholesky, choleskySolve, type Matrix } from './linalg.js';

/** One review reduced to its weighted score. */
export interface ScoredReview {
  judgeId: string;
  projectId: string;
  score: number;
}

export interface NormalizeOptions {
  /** Fix the penalties instead of choosing them by leave-one-out error. */
  lambdaB?: number;
  lambdaQ?: number;
  /** Candidate penalties for the search (both λ_b and λ_q), BUILD-PLAN §7.2. */
  grid?: readonly number[];
}

export interface ProjectEstimate {
  projectId: string;
  reviews: number;
  /** Plain mean of its review scores. */
  raw: number;
  /** μ + q̂_p: the score with every judge's leniency taken out. */
  normalized: number;
  /** Posterior standard deviation of `normalized`: how sure the model is. */
  sd: number;
  /** normalized − raw. */
  adjustment: number;
}

export interface JudgeEstimate {
  judgeId: string;
  reviews: number;
  /** Mean of the scores they gave. */
  raw: number;
  /** b̂_j: how much more (+) or less (−) generous than average, on the score scale. */
  bias: number;
}

export interface LambdaPoint {
  lambdaB: number;
  lambdaQ: number;
  /** Leave-one-review-out mean squared prediction error. */
  looMse: number;
}

export interface NormalizeResult {
  mu: number;
  lambdaB: number;
  lambdaQ: number;
  /** Residual variance σ̂² (noise per review). */
  sigma2: number;
  looMse: number;
  /** Every λ pair tried, in grid order (empty when λ was given). */
  curve: LambdaPoint[];
  /**
   * True when the chosen λ_b or λ_q is the smallest or largest in the grid: the best value may
   * lie outside it, so the choice is the grid's rather than the data's.
   */
  atEdge: boolean;
  /**
   * Leave-one-out error of predicting every review by the mean of all the others: the baseline
   * that says how much project and judge explain at all.
   */
  meanOnlyLooMse: number;
  projects: ProjectEstimate[];
  judges: JudgeEstimate[];
}

/**
 * λ candidates, doubling from 0.125 to 64. BUILD-PLAN §7.2 planned 0.25–8, but both ends were
 * hit in practice: synthetic events chose λ_q = 0.25 and the fixtures' leave-one-out error was
 * still falling at λ = 8 (its minimum is near 16–32). A choice on the edge is reported (`atEdge`).
 */
export const DEFAULT_GRID: readonly number[] = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];

/**
 * Joint additive model (BUILD-PLAN §7.2, decision 10):
 *
 *   s_pj = μ + q_p + b_j + ε,  minimise Σ (s_pj − μ − q_p − b_j)² + λ_b Σ b_j² + λ_q Σ q_p²
 *
 * Every project's quality and every judge's leniency are estimated together from who reviewed
 * what, so a generous judge in a strong track is not confused with a strong project. The ridge
 * penalty (a Gaussian prior on q and b) keeps sparse cases sensible: a judge with one review
 * is mostly taken at face value, a project with two reviews is pulled towards the mean. A judge
 * who gives everything the same marks has their offset absorbed by b̂ and no division by their
 * spread is ever made.
 *
 * λ_b and λ_q are chosen by exact leave-one-review-out prediction error over `grid`
 * (e_i / (1 − h_ii), no refits). Deterministic; the only inputs are the reviews.
 */
export function normalize(
  reviews: readonly ScoredReview[],
  opts: NormalizeOptions = {},
): NormalizeResult {
  if (reviews.length === 0) throw new RangeError('no reviews to normalise');
  const design = buildDesign(reviews);

  let curve: LambdaPoint[] = [];
  let atEdge = false;
  let best: Fit;
  if (opts.lambdaB !== undefined && opts.lambdaQ !== undefined) {
    best = fit(design, opts.lambdaB, opts.lambdaQ);
  } else {
    const grid = opts.grid ?? DEFAULT_GRID;
    const fits = grid.flatMap((lb) => grid.map((lq) => fit(design, lb, lq)));
    curve = fits.map((f) => ({ lambdaB: f.lambdaB, lambdaQ: f.lambdaQ, looMse: f.looMse }));
    const lo = Math.min(...grid);
    const hi = Math.max(...grid);
    // Lowest error; ties go to the stronger penalty (the simpler model).
    best = fits.reduce((a, b) =>
      b.looMse < a.looMse - 1e-12 ||
      (Math.abs(b.looMse - a.looMse) <= 1e-12 && b.lambdaB + b.lambdaQ > a.lambdaB + a.lambdaQ)
        ? b
        : a,
    );
    atEdge = [best.lambdaB, best.lambdaQ].some((l) => l === lo || l === hi);
  }

  const { projects, judges, rows } = design;
  const P = projects.length;
  const mu = best.theta[0]!;
  const byProject = groupMean(rows, (r) => r.p);
  const byJudge = groupMean(rows, (r) => r.j);
  return {
    mu,
    lambdaB: best.lambdaB,
    lambdaQ: best.lambdaQ,
    sigma2: best.sigma2,
    looMse: best.looMse,
    curve,
    atEdge,
    meanOnlyLooMse: meanOnlyLoo(rows.map((r) => r.s)),
    projects: projects.map((projectId, p) => {
      const q = 1 + p;
      const variance = best.sigma2 * (best.inv[0]![0]! + best.inv[q]![q]! + 2 * best.inv[0]![q]!);
      const normalized = mu + best.theta[q]!;
      return {
        projectId,
        reviews: byProject.count[p]!,
        raw: byProject.mean[p]!,
        normalized,
        sd: Math.sqrt(Math.max(variance, 0)),
        adjustment: normalized - byProject.mean[p]!,
      };
    }),
    judges: judges.map((judgeId, j) => ({
      judgeId,
      reviews: byJudge.count[j]!,
      raw: byJudge.mean[j]!,
      bias: best.theta[1 + P + j]!,
    })),
  };
}

interface Design {
  projects: string[];
  judges: string[];
  /** Each review as (project index, judge index, score). */
  rows: { p: number; j: number; s: number }[];
}

interface Fit {
  lambdaB: number;
  lambdaQ: number;
  theta: number[];
  inv: Matrix;
  sigma2: number;
  looMse: number;
}

function buildDesign(reviews: readonly ScoredReview[]): Design {
  // Sorted ids: the same reviews always give the same system, whatever their order.
  const projects = [...new Set(reviews.map((r) => r.projectId))].sort();
  const judges = [...new Set(reviews.map((r) => r.judgeId))].sort();
  const pi = new Map(projects.map((id, i) => [id, i]));
  const ji = new Map(judges.map((id, i) => [id, i]));
  const rows = reviews.map((r) => {
    if (!Number.isFinite(r.score)) throw new RangeError(`score is not a number: ${r.score}`);
    return { p: pi.get(r.projectId)!, j: ji.get(r.judgeId)!, s: r.score };
  });
  // Summing in a fixed order makes the result bit-for-bit identical for any input order
  // (floating-point addition is not associative), so a published ranking can be re-derived.
  rows.sort((a, b) => a.p - b.p || a.j - b.j || a.s - b.s);
  return { projects, judges, rows };
}

/**
 * θ = (μ, q_1…q_P, b_1…b_J). Each review's design row has three ones (μ, its project, its
 * judge), so XᵀX and Xᵀs are sums of counts and scores; the penalties go on the diagonal.
 */
function fit(d: Design, lambdaB: number, lambdaQ: number): Fit {
  if (!(lambdaB > 0) || !(lambdaQ > 0)) throw new RangeError('penalties must be positive');
  const P = d.projects.length;
  const n = 1 + P + d.judges.length;
  const a: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const rhs = new Array<number>(n).fill(0);
  for (const { p, j, s } of d.rows) {
    const idx = [0, 1 + p, 1 + P + j];
    for (const x of idx) {
      rhs[x]! += s;
      for (const y of idx) a[x]![y]! += 1;
    }
  }
  for (let i = 1; i < n; i++) a[i]![i]! += i <= P ? lambdaQ : lambdaB;

  const l = cholesky(a);
  const theta = choleskySolve(l, rhs);
  const inv = choleskyInverse(l);

  let sse = 0;
  let loo = 0;
  let trace = 0;
  for (const { p, j, s } of d.rows) {
    const idx = [0, 1 + p, 1 + P + j];
    const e = s - idx.reduce((sum, i) => sum + theta[i]!, 0);
    // h_ii = x_iᵀ (XᵀX + Λ)⁻¹ x_i with x_i the three ones above.
    let h = 0;
    for (const x of idx) for (const y of idx) h += inv[x]![y]!;
    sse += e * e;
    loo += (e / (1 - h)) ** 2;
    trace += h;
  }
  const N = d.rows.length;
  // Residual variance with the effective degrees of freedom of a ridge fit.
  const sigma2 = sse / Math.max(N - trace, 1);
  return { lambdaB, lambdaQ, theta, inv, sigma2, looMse: loo / N };
}

/** Predict each value by the mean of all the others; mean squared error. */
function meanOnlyLoo(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const sum = xs.reduce((a, b) => a + b, 0);
  return xs.reduce((a, x) => a + (x - (sum - x) / (n - 1)) ** 2, 0) / n;
}

function groupMean<T extends { s: number }>(rows: readonly T[], key: (r: T) => number) {
  const sum = new Map<number, number>();
  const count = new Map<number, number>();
  for (const r of rows) {
    sum.set(key(r), (sum.get(key(r)) ?? 0) + r.s);
    count.set(key(r), (count.get(key(r)) ?? 0) + 1);
  }
  const n = Math.max(-1, ...count.keys()) + 1;
  return {
    count: Array.from({ length: n }, (_, i) => count.get(i) ?? 0),
    mean: Array.from({ length: n }, (_, i) => (sum.get(i) ?? 0) / (count.get(i) ?? 1)),
  };
}

/**
 * Groups projects that the data cannot tell apart, in rank order, **without chaining**
 * (decision 59): a project joins the current group if it is within one pooled standard
 * deviation of the group's *leader*, not merely of its neighbour, so a long run of small gaps
 * cannot sweep everyone into one tie. Returns group numbers from 1, in the given order.
 */
export function tieGroups(ranked: readonly { normalized: number; sd: number }[]): number[] {
  const groups: number[] = [];
  let group = 0;
  let leader: { normalized: number; sd: number } | undefined;
  for (const p of ranked) {
    const pooled = leader ? Math.sqrt((leader.sd ** 2 + p.sd ** 2) / 2) : 0;
    if (!leader || leader.normalized - p.normalized >= pooled) {
      group++;
      leader = p;
    }
    groups.push(group);
  }
  return groups;
}
