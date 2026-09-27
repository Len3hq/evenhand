import { components } from './assign.js';
import { rawMeans, spearman, zScores } from './baselines.js';
import { normalize, type NormalizeResult, type ScoredReview, tieGroups } from './normalize.js';
import { mean, spread } from './stats.js';
import { syntheticEvent } from './synthetic.js';

/** The parts of the organisers' fixtures.json the proof reads. */
export interface ProofFixtures {
  judges: { id: string; name: string }[];
  projects: { id: string; title: string; team: string; track: string; submitted_at: string }[];
  tracks: { id: string; name: string }[];
  scores: { judge: string; project: string; criteria: Record<string, number> }[];
}

/**
 * The Normalization Proof (BUILD-PLAN §7.4), rendered as Markdown from fixtures.json alone.
 * Pure and deterministic: `scripts/proof.mjs` writes it to docs/proof/normalization.md and a
 * test fails if the committed file no longer matches, so the published numbers are checked,
 * not trusted.
 */
export function renderProof(fx: ProofFixtures): string {
  const held = heldDuplicates(fx);
  const judged = fx.scores.filter((s) => !held.has(s.project));
  const reviews = toReviews(judged);
  const res = normalize(reviews);
  const title = new Map(fx.projects.map((p) => [p.id, p.title]));
  const judgeName = new Map(fx.judges.map((j) => [j.id, j.name]));
  const flat = flatJudges(judged);

  const out: string[] = [];
  const line = (s = '') => out.push(s);

  line('# Normalization Proof');
  line();
  line(
    '_Generated from `data/fixtures.json` by `npm run proof -w @evenhand/judging-engine` ' +
      '(`src/judging-engine/src/proof.ts`). A test regenerates this file and fails if it differs, ' +
      'so every number below is what the code computes today._',
  );
  line();
  line('## 1. Data');
  line();
  line(
    `${judged.length} reviews of ${res.projects.length} projects by ${res.judges.length} judges. ` +
      `Each review's score is the mean of its ${criteriaCount(judged)} criteria (equal weights: the fixtures carry none). ` +
      `The earlier copy of the Dry Harbour duplicate (${[...held].join(', ')}) is held out of judging, ` +
      `as in the portal; its ${fx.scores.length - judged.length} reviews are used only for the test–retest in §7.`,
  );
  line();

  line('## 2. Choosing λ by leave-one-out error');
  line();
  const gain = 1 - res.looMse / res.meanOnlyLooMse;
  line(
    `Chosen: **λ_b = ${res.lambdaB}, λ_q = ${res.lambdaQ}** (leave-one-review-out MSE ${f(res.looMse, 4)}${res.atEdge ? '; **on the edge of the grid**, so the best value may lie outside it' : ', inside the grid'}). ` +
      `μ = ${f(res.mu, 3)}, residual σ̂ = ${f(Math.sqrt(res.sigma2), 3)}. ` +
      'Rows are λ_b, columns λ_q; each cell is the leave-one-out mean squared error.',
  );
  line();
  line(
    `**How much signal is there?** Predicting every review by the mean of all the others gives a leave-one-out MSE of ${f(res.meanOnlyLooMse, 4)}; ` +
      `the fitted model improves on that by ${f(gain * 100, 1)}%. In the fixtures, which project was judged and who judged it explain very little of any one score, ` +
      'so the λ that predicts best is a large one: project qualities are pulled strongly towards the mean. ' +
      'The honest reading is not a precise ranking of 40 projects but the tie groups in §4. ' +
      'On synthetic events with real differences between projects (§9) the same code recovers the true ranking well.',
  );
  line();
  const grid = [...new Set(res.curve.map((c) => c.lambdaQ))];
  line(`| λ_b \\ λ_q | ${grid.join(' | ')} |`);
  line(`|---|${grid.map(() => '---').join('|')}|`);
  for (const lb of [...new Set(res.curve.map((c) => c.lambdaB))]) {
    const cells = grid.map((lq) => {
      const c = res.curve.find((x) => x.lambdaB === lb && x.lambdaQ === lq)!;
      const s = f(c.looMse, 4);
      return lb === res.lambdaB && lq === res.lambdaQ ? `**${s}**` : s;
    });
    line(`| ${lb} | ${cells.join(' | ')} |`);
  }
  line();

  line('## 3. Judge leniency');
  line();
  line(
    'b̂ is how much more (+) or less (−) generous than average a judge is, on the 1–5 scale. ' +
      'Judges with one review are shrunk towards 0: one score says little about a judge. ' +
      `Flat judges (the same marks on every project) are marked ◼: ${flat.length ? flat.join(', ') : 'none'}.`,
  );
  line();
  line('| Judge | Reviews | Mean given | b̂ |');
  line('|---|---:|---:|---:|');
  for (const j of [...res.judges].sort((a, b) => b.bias - a.bias || cmp(a.judgeId, b.judgeId))) {
    const mark = flat.includes(j.judgeId) ? ' ◼' : '';
    line(
      `| ${j.judgeId} ${judgeName.get(j.judgeId) ?? ''}${mark} | ${j.reviews} | ${f(j.raw, 2)} | ${sign(j.bias)} |`,
    );
  }
  line();

  line('## 4. Raw vs normalized ranking');
  line();
  const ranked = rankOf(res);
  const groups = tieGroups(
    ranked.map((r) => res.projects.find((p) => p.projectId === r.projectId)!),
  );
  const rawRank = new Map(
    [...res.projects]
      .sort((a, b) => b.raw - a.raw || cmp(a.projectId, b.projectId))
      .map((p, i) => [p.projectId, i + 1]),
  );
  line(
    'Sorted by normalized score (μ + q̂). "Move" is the change against ranking by raw mean. ' +
      '"Group" is a tie group: projects within one pooled SD of the group\'s leader, without chaining; ' +
      'read ranks inside a group as equal.',
  );
  line();
  line('| Rank | Group | Project | Reviews | Raw mean | Normalized | ± SD | Move |');
  line('|---:|---:|---|---:|---:|---:|---:|---:|');
  ranked.forEach((p, i) => {
    const move = rawRank.get(p.projectId)! - (i + 1);
    line(
      `| ${i + 1} | ${groups[i]} | ${p.projectId} ${title.get(p.projectId)} | ${p.reviews} | ${f(p.raw, 2)} | ${f(p.normalized, 2)} | ${f(p.sd, 2)} | ${move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '·'} |`,
    );
  });
  line();
  const moved = ranked.filter((p, i) => rawRank.get(p.projectId) !== i + 1).length;
  line(
    `${moved} of ${ranked.length} projects change rank; ${new Set(groups).size} tie groups. ` +
      `Spearman ρ between raw and normalized ranking: ${f(
        spearman(
          ranked.map((p) => p.raw),
          ranked.map((p) => p.normalized),
        ),
        3,
      )}.`,
  );
  line();

  line('## 5. Spread of judges before and after');
  line();
  const judgeMeans = res.judges.map((j) => j.raw);
  const adjusted = res.judges.map((j) => j.raw - j.bias);
  line(
    `Standard deviation of judges' mean scores: **${f(spread(judgeMeans), 3)} before**, ` +
      `**${f(spread(adjusted), 3)} after** taking out each judge's b̂. ` +
      'What remains is mostly that judges saw different projects, which the model keeps.',
  );
  line();

  line('## 6. Sensitivity');
  line();
  const base = ranked.map((p) => p.projectId);
  const rho = (other: NormalizeResult) => {
    const byId = new Map(other.projects.map((p) => [p.projectId, p.normalized]));
    return spearman(
      base.map((id) => res.projects.find((p) => p.projectId === id)!.normalized),
      base.map((id) => byId.get(id)!),
    );
  };
  const alt = (factor: number) =>
    normalize(reviews, { lambdaB: res.lambdaB * factor, lambdaQ: res.lambdaQ * factor });
  const top = (other: NormalizeResult, n: number) =>
    [...other.projects]
      .sort((a, b) => b.normalized - a.normalized || cmp(a.projectId, b.projectId))
      .slice(0, n)
      .map((p) => p.projectId);
  const sameTop = (other: NormalizeResult) =>
    top(other, 5).filter((id) => top(res, 5).includes(id)).length;
  line('| Variant | Spearman ρ with the chosen ranking | Same top 5 |');
  line('|---|---:|---:|');
  for (const factor of [0.5, 2]) {
    const v = alt(factor);
    line(`| λ × ${factor} | ${f(rho(v), 3)} | ${sameTop(v)} of 5 |`);
  }
  for (const [label, weights] of Object.entries(alternativeWeights(judged))) {
    const v = normalize(toReviews(judged, weights), { lambdaB: res.lambdaB, lambdaQ: res.lambdaQ });
    line(`| ${label} | ${f(rho(v), 3)} | ${sameTop(v)} of 5 |`);
  }
  line();

  line('## 7. Test–retest on the Dry Harbour duplicate');
  line();
  const [early, late] = dryHarbour(fx);
  const retest = fx.judges
    .map((j) => j.id)
    .flatMap((j) => {
      const a = fx.scores.find((s) => s.judge === j && s.project === early);
      const b = fx.scores.find((s) => s.judge === j && s.project === late);
      return a && b ? [{ judge: j, a: avg(a.criteria), b: avg(b.criteria) }] : [];
    });
  if (retest.length) {
    line(
      `The same team submitted the same project twice (${early} and ${late}); these judges scored both. ` +
        "Their differences estimate a judge's own noise on an identical project.",
    );
    line();
    line(`| Judge | ${early} | ${late} | Difference |`);
    line('|---|---:|---:|---:|');
    for (const r of retest)
      line(`| ${r.judge} | ${f(r.a, 2)} | ${f(r.b, 2)} | ${sign(r.b - r.a)} |`);
    line();
    const diffs = retest.map((r) => r.b - r.a);
    const sigma = Math.sqrt(res.sigma2);
    // Two reviews with independent N(0, σ²) noise differ by |N(0, 2σ²)|, whose mean is 2σ/√π.
    const expected = (2 * sigma) / Math.sqrt(Math.PI);
    line(
      `Mean absolute difference: **${f(mean(diffs.map(Math.abs)), 2)}**. If each review carried the model's noise ` +
        `(σ̂ = ${f(sigma, 2)}), two reviews of the same work would differ by ${f(expected, 2)} on average (2σ/√π). ` +
        `These judges disagree with themselves ${mean(diffs.map(Math.abs)) > expected ? 'more' : 'less'} than that, ` +
        `on only ${retest.length} pairs: consistent with noisy judging, and too few pairs to estimate each judge's own noise.`,
    );
  } else {
    line('No judge scored both copies.');
  }
  line();

  line('## 8. Against the usual alternatives');
  line();
  const raw = rawMeans(reviews);
  const z = zScores(reviews);
  const norm = ranked.map((p) => p.normalized);
  line('| Method | Spearman ρ with the normalized ranking | Notes |');
  line('|---|---:|---|');
  line(
    `| Raw mean | ${f(
      spearman(
        norm,
        ranked.map((p) => raw.get(p.projectId)!),
      ),
      3,
    )} | Rewards drawing generous judges |`,
  );
  const zr = ranked.filter((p) => z.scores.has(p.projectId));
  line(
    `| Per-judge z-score | ${f(
      spearman(
        zr.map((p) => p.normalized),
        zr.map((p) => z.scores.get(p.projectId)!),
      ),
      3,
    )} | ` +
      `Divides by each judge's SD: drops ${z.dropped.join(', ') || 'no one'} (SD 0) and assumes every judge saw average projects |`,
  );
  line('| Borda / rank-based | – | Throws away score gaps; not used |');
  line('| Bradley–Terry | – | Needs pairwise comparisons; the fixtures have ratings only |');
  line();

  line('## 9. Synthetic recovery (known truth)');
  line();
  line(
    'Seeded events generated with a known quality per project and leniency per judge (`src/synthetic.ts`): ' +
      '40 projects in 5 tracks of different strength, 25 track judges + 5 bridge judges, 3 reviews per project, ' +
      'noise SD 0.4. Mean Spearman ρ between each method and the true ranking over 20 seeds:',
  );
  line();
  line('| Judge leniency SD | Joint model | Raw mean | Per-judge z-score | Joint beats raw |');
  line('|---:|---:|---:|---:|---:|');
  for (const biasSd of [0.5, 1.0]) {
    const runs = Array.from({ length: 20 }, (_, i) => {
      const ev = syntheticEvent({ seed: i + 1, biasSd });
      const ids = [...ev.quality.keys()];
      const truth = ids.map((id) => ev.quality.get(id)!);
      const j = new Map(normalize(ev.reviews).projects.map((p) => [p.projectId, p.normalized]));
      const r = rawMeans(ev.reviews);
      const zz = zScores(ev.reviews).scores;
      return {
        joint: spearman(
          ids.map((id) => j.get(id)!),
          truth,
        ),
        raw: spearman(
          ids.map((id) => r.get(id)!),
          truth,
        ),
        z: spearman(
          ids.map((id) => zz.get(id)!),
          truth,
        ),
      };
    });
    const m = (k: 'joint' | 'raw' | 'z') => f(mean(runs.map((x) => x[k])), 3);
    line(
      `| ${biasSd} | ${m('joint')} | ${m('raw')} | ${m('z')} | ${runs.filter((x) => x.joint > x.raw).length} of 20 |`,
    );
  }
  line();

  line('## 10. Connectivity');
  line();
  const comps = components(judged.map((s) => ({ judgeId: s.judge, projectId: s.project })));
  line(
    comps === 1
      ? 'Every judge and project is in one connected group: all judges can be compared with each other through shared projects and bridge judges.'
      : `The judge–project graph has ${comps} separate groups: scores are only comparable within a group.`,
  );
  line();
  return `${out.join('\n')}\n`;
}

/** The earlier copy of a same-team, same-title pair, as the portal's importer holds it. */
function heldDuplicates(fx: ProofFixtures): Set<string> {
  const [early] = dryHarbour(fx);
  return new Set(early ? [early] : []);
}

function dryHarbour(fx: ProofFixtures): [string, string] | [] {
  const byKey = new Map<string, ProofFixtures['projects']>();
  for (const p of fx.projects) {
    const key = `${p.team}|${p.title.trim().toLowerCase()}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  for (const list of byKey.values()) {
    if (list.length === 2) {
      const [a, b] = [...list].sort((x, y) => cmp(x.submitted_at, y.submitted_at));
      return [a!.id, b!.id];
    }
  }
  return [];
}

function toReviews(
  scores: ProofFixtures['scores'],
  weights?: Record<string, number>,
): ScoredReview[] {
  return scores.map((s) => ({
    judgeId: s.judge,
    projectId: s.project,
    score: avg(s.criteria, weights),
  }));
}

function avg(criteria: Record<string, number>, weights?: Record<string, number>): number {
  const keys = Object.keys(criteria).sort();
  const w = (k: string) => weights?.[k] ?? 1;
  return keys.reduce((s, k) => s + w(k) * criteria[k]!, 0) / keys.reduce((s, k) => s + w(k), 0);
}

function alternativeWeights(
  scores: ProofFixtures['scores'],
): Record<string, Record<string, number>> {
  const keys = [...new Set(scores.flatMap((s) => Object.keys(s.criteria)))].sort();
  return Object.fromEntries(keys.map((k) => [`${k} counts double`, { [k]: 2 }]));
}

function criteriaCount(scores: ProofFixtures['scores']): number {
  return new Set(scores.flatMap((s) => Object.keys(s.criteria))).size;
}

function flatJudges(scores: ProofFixtures['scores']): string[] {
  const by = new Map<string, string[]>();
  for (const s of scores) {
    const key = JSON.stringify(Object.entries(s.criteria).sort(([a], [b]) => cmp(a, b)));
    by.set(s.judge, [...(by.get(s.judge) ?? []), key]);
  }
  return [...by]
    .filter(([, marks]) => marks.length >= 3 && marks.every((m) => m === marks[0]))
    .map(([j]) => j)
    .sort();
}

function rankOf(res: NormalizeResult) {
  return [...res.projects].sort(
    (a, b) =>
      b.normalized - a.normalized ||
      b.raw - a.raw ||
      b.reviews - a.reviews ||
      cmp(a.projectId, b.projectId),
  );
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const f = (x: number, digits: number) =>
  (Object.is(Math.round(x * 10 ** digits), -0) ? 0 : x).toFixed(digits);
const sign = (x: number) => {
  const s = f(x, 2);
  return s.startsWith('-') ? `−${s.slice(1)}` : s === '0.00' ? '0.00' : `+${s}`;
};
