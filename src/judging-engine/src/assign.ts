import { createRng, shuffle } from './rng.js';

/** A project that can be judged. `trackId` null means it is in no track. */
export interface AssignProject {
  id: string;
  trackId: string | null;
  teamId: string;
}

/** A judge and the tracks they cover. */
export interface AssignJudge {
  id: string;
  trackIds: readonly string[];
}

export interface AssignInput {
  projects: readonly AssignProject[];
  judges: readonly AssignJudge[];
  /** Assignments that already exist (finished or not); they count and are never repeated. */
  existing: readonly { judgeId: string; projectId: string }[];
  /** Judge × team pairs that must never meet (conflict of interest). */
  conflicts: readonly { judgeId: string; teamId: string }[];
  /** Reviews wanted per project. */
  target: number;
  /** Seed for every random choice, so a run can be reproduced exactly. */
  seed: number;
}

export interface NewAssignment {
  judgeId: string;
  projectId: string;
  /** Position among this judge's new assignments (shuffled), 0-based. */
  order: number;
}

export interface AssignResult {
  added: NewAssignment[];
  /** Projects still below the target, and how many judges could review them at all. */
  shortfalls: { projectId: string; have: number; eligibleJudges: number }[];
  /** Assignments per judge after the run (existing + new), within the given projects. */
  load: Record<string, number>;
  /**
   * Connected groups in the judge–project graph after the run. More than one means some
   * judges never share a project with others, so their leniency cannot be compared.
   */
  components: number;
}

/**
 * Greedy, least-loaded, track-matched assignment (BUILD-PLAN §9, decision 17).
 *
 * Repeatedly take the project with the fewest reviews (ties in a seeded random order) and give
 * it to the least-loaded judge who may review it (ties in a seeded random order), until every
 * project has `target` reviews or has run out of eligible judges.
 *
 * A judge may review a project if they cover its track (a trackless project can go to anyone),
 * have no conflict with its team, and are not already assigned to it. Pure and deterministic.
 */
export function assign(input: AssignInput): AssignResult {
  if (!Number.isInteger(input.target) || input.target < 1) {
    throw new RangeError(`target must be a positive integer, got ${input.target}`);
  }
  const rng = createRng(input.seed);
  const projects = shuffle(input.projects, rng);
  const judges = shuffle(input.judges, rng);
  const projectIds = new Set(projects.map((p) => p.id));
  const blocked = new Set(input.conflicts.map((c) => `${c.judgeId}|${c.teamId}`));
  const pair = new Set<string>();
  const have = new Map(projects.map((p) => [p.id, 0]));
  const load = new Map(judges.map((j) => [j.id, 0]));
  for (const e of input.existing) {
    if (!projectIds.has(e.projectId) || pair.has(`${e.judgeId}|${e.projectId}`)) continue;
    pair.add(`${e.judgeId}|${e.projectId}`);
    have.set(e.projectId, have.get(e.projectId)! + 1);
    if (load.has(e.judgeId)) load.set(e.judgeId, load.get(e.judgeId)! + 1);
  }

  const mayReview = (j: AssignJudge, p: AssignProject): boolean =>
    (p.trackId === null || j.trackIds.includes(p.trackId)) && !blocked.has(`${j.id}|${p.teamId}`);
  const candidates = (p: AssignProject): AssignJudge[] =>
    judges.filter((j) => mayReview(j, p) && !pair.has(`${j.id}|${p.id}`));

  const picked: { judgeId: string; projectId: string }[] = [];
  for (;;) {
    let best: AssignProject | undefined;
    for (const p of projects) {
      const n = have.get(p.id)!;
      if (n >= input.target || (best && n >= have.get(best.id)!)) continue;
      if (candidates(p).length) best = p;
    }
    if (!best) break;
    // Least loaded first; `judges` is already in seeded random order, so ties are random.
    const judge = candidates(best).reduce((a, b) => (load.get(b.id)! < load.get(a.id)! ? b : a));
    pair.add(`${judge.id}|${best.id}`);
    have.set(best.id, have.get(best.id)! + 1);
    load.set(judge.id, load.get(judge.id)! + 1);
    picked.push({ judgeId: judge.id, projectId: best.id });
  }

  // Each judge's new projects go into their queue in a seeded random order.
  const added: NewAssignment[] = [];
  for (const j of judges) {
    const mine = shuffle(
      picked.filter((a) => a.judgeId === j.id),
      rng,
    );
    mine.forEach((a, order) => added.push({ ...a, order }));
  }

  const shortfalls = projects
    .filter((p) => have.get(p.id)! < input.target)
    .map((p) => ({
      projectId: p.id,
      have: have.get(p.id)!,
      eligibleJudges: judges.filter((j) => mayReview(j, p)).length,
    }))
    .sort((a, b) => a.have - b.have || (a.projectId < b.projectId ? -1 : 1));

  const edges = [...input.existing.filter((e) => projectIds.has(e.projectId)), ...picked];
  return {
    added,
    shortfalls,
    load: Object.fromEntries([...load].sort(([a], [b]) => (a < b ? -1 : 1))),
    components: components(edges),
  };
}

/** Connected components of a bipartite judge–project graph given by its edges. */
export function components(edges: readonly { judgeId: string; projectId: string }[]): number {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const add = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  for (const e of edges) {
    const a = `j:${e.judgeId}`;
    const b = `p:${e.projectId}`;
    add(a);
    add(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  return new Set([...parent.keys()].map(find)).size;
}
