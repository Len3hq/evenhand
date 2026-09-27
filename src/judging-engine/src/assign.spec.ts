import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type AssignInput, assign, components } from './assign.js';

const projects = (n: number, trackId: string | null = 't1') =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, trackId, teamId: `team${i}` }));
const judges = (n: number, trackIds = ['t1']) =>
  Array.from({ length: n }, (_, i) => ({ id: `j${i}`, trackIds }));
const base = (over: Partial<AssignInput> = {}): AssignInput => ({
  projects: projects(10),
  judges: judges(6),
  existing: [],
  conflicts: [],
  target: 3,
  seed: 42,
  ...over,
});

const perProject = (added: { projectId: string }[]) =>
  added.reduce<Record<string, number>>(
    (m, a) => ({ ...m, [a.projectId]: (m[a.projectId] ?? 0) + 1 }),
    {},
  );

describe('assign', () => {
  it('gives every project the target number of reviews, spread evenly', () => {
    const r = assign(base());
    expect(Object.values(perProject(r.added))).toEqual(Array(10).fill(3));
    const loads = Object.values(r.load);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1); // 30 over 6 judges
    expect(r.shortfalls).toEqual([]);
  });

  it('never assigns a judge twice to one project, or repeats an existing assignment', () => {
    const existing = [{ judgeId: 'j0', projectId: 'p0' }];
    const r = assign(base({ existing }));
    const pairs = r.added.map((a) => `${a.judgeId}|${a.projectId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(pairs).not.toContain('j0|p0');
    expect(perProject(r.added).p0).toBe(2); // one already existed
  });

  it('only gives a judge projects in their tracks; trackless projects go to anyone', () => {
    const r = assign(
      base({
        projects: [...projects(3, 'games'), { id: 'loose', trackId: null, teamId: 'tl' }],
        judges: [
          { id: 'g1', trackIds: ['games'] },
          { id: 'g2', trackIds: ['games'] },
          { id: 'g3', trackIds: ['games'] },
          { id: 'x1', trackIds: ['tools'] },
        ],
      }),
    );
    for (const a of r.added) {
      if (a.projectId !== 'loose') expect(a.judgeId).toMatch(/^g/);
    }
    expect(perProject(r.added).loose).toBe(3);
  });

  it('respects conflicts of interest', () => {
    const r = assign(base({ conflicts: [{ judgeId: 'j0', teamId: 'team0' }] }));
    expect(r.added).not.toContainEqual(expect.objectContaining({ judgeId: 'j0', projectId: 'p0' }));
    expect(perProject(r.added).p0).toBe(3);
  });

  it('reports projects that cannot reach the target instead of hiding them', () => {
    const r = assign(base({ judges: judges(2) }));
    expect(r.shortfalls).toHaveLength(10);
    expect(r.shortfalls[0]).toEqual({ projectId: expect.any(String), have: 2, eligibleJudges: 2 });
  });

  it('is reproducible from its seed, and a different seed gives a different draw', () => {
    expect(assign(base())).toEqual(assign(base()));
    expect(assign(base({ seed: 43 })).added).not.toEqual(assign(base()).added);
  });

  it('adds nothing when every project already has enough', () => {
    const first = assign(base());
    const again = assign(base({ existing: first.added }));
    expect(again.added).toEqual([]);
  });

  it('numbers each judge’s new projects 0, 1, 2… in a shuffled order', () => {
    const r = assign(base());
    for (const j of ['j0', 'j1']) {
      const orders = r.added.filter((a) => a.judgeId === j).map((a) => a.order);
      expect([...orders].sort((a, b) => a - b)).toEqual(orders.map((_, i) => i));
    }
  });

  it('refuses a target below 1', () => {
    expect(() => assign(base({ target: 0 }))).toThrow(RangeError);
  });
});

describe('components', () => {
  it('counts groups of judges that share projects', () => {
    expect(
      components([
        { judgeId: 'a', projectId: 'p1' },
        { judgeId: 'b', projectId: 'p1' },
        { judgeId: 'c', projectId: 'p2' },
      ]),
    ).toBe(2);
    expect(components([])).toBe(0);
  });
});

describe('on the organisers’ fixtures', () => {
  interface Fx {
    judges: { id: string; tracks: string[] }[];
    projects: { id: string; team: string; track: string }[];
    scores: { judge: string; project: string }[];
  }
  const fx = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../data/fixtures.json', import.meta.url)), 'utf8'),
  ) as Fx;

  it('tops every project up to 3 reviews around the 126 that exist', () => {
    const r = assign({
      projects: fx.projects.map((p) => ({ id: p.id, trackId: p.track, teamId: p.team })),
      judges: fx.judges.map((j) => ({ id: j.id, trackIds: j.tracks })),
      existing: fx.scores.map((s) => ({ judgeId: s.judge, projectId: s.project })),
      conflicts: [],
      target: 3,
      seed: 1,
    });
    const have = perProject([...fx.scores.map((s) => ({ projectId: s.project })), ...r.added]);
    const below = fx.projects.filter((p) => (have[p.id] ?? 0) < 3);
    expect(below.map((p) => p.id)).toEqual(r.shortfalls.map((s) => s.projectId).sort());
    // Every project that has judges for its track reaches 3.
    for (const s of r.shortfalls) expect(s.eligibleJudges).toBeLessThan(3);
    expect(r.added.length).toBeGreaterThan(0);
  });
});
