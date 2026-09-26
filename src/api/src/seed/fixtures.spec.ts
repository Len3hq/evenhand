import { readFileSync } from 'node:fs';
import { criterionKeys, FixtureError, parseFixtures } from './fixtures.js';

const real = JSON.parse(
  readFileSync(new URL('../../../../data/fixtures.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('parseFixtures', () => {
  it('accepts the organisers’ fixtures.json and keeps every record', () => {
    const fx = parseFixtures(real);
    expect(fx.projects).toHaveLength(41);
    expect(fx.judges).toHaveLength(30);
    expect(fx.tracks).toHaveLength(8);
    expect(fx.scores).toHaveLength(126);
    expect(fx.projects.slice(0, 3).map((p) => p.title)).toEqual([
      'Glass Signal',
      'Small Meadow',
      'Deep Compass',
    ]);
  });

  it('derives the rubric from the union of score keys', () => {
    expect(new Set(criterionKeys(parseFixtures(real).scores))).toEqual(
      new Set(['functionality', 'innovation', 'quality']),
    );
  });

  it('reports every broken reference at once', () => {
    const broken = structuredClone(real) as { scores: { judge: string; project: string }[] };
    broken.scores[0]!.judge = 'jdg_nope';
    broken.scores[1]!.project = 'prj_nope';
    try {
      parseFixtures(broken);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(FixtureError);
      expect((e as FixtureError).problems).toEqual(
        expect.arrayContaining([
          expect.stringContaining('unknown judge jdg_nope'),
          expect.stringContaining('unknown project prj_nope'),
        ]),
      );
    }
  });

  it('rejects a non-ISO deadline', () => {
    const bad = structuredClone(real) as { event: { submissions_close: string } };
    bad.event.submissions_close = 'next friday';
    expect(() => parseFixtures(bad)).toThrow(/ISO 8601/);
  });
});
