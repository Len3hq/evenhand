import { ExtensionError, parseExtension } from './extension.js';

const tracks = new Set(['trk_01']);
const projects = new Set(['prj_01']);
const parse = (raw: unknown) => parseExtension(raw, tracks, projects);

describe('the evenhand block', () => {
  it('is optional', () => {
    expect(parse(undefined)).toBeNull();
  });

  it('accepts a full block', () => {
    const ext = parse({
      version: 1,
      event: { slug: 'spring', opens_at: '2026-01-01T00:00:00Z', judging_close: null },
      prizes: [{ name: 'Best tool', description: null, track: 'trk_01' }],
      criteria: [{ key: 'impact', label: 'Impact', weight: 2, min: 1, max: 5, order: 0 }],
      projects: { prj_01: { tagline: 'Short', tech_tags: ['ts'] } },
    });
    expect(ext?.prizes?.[0]?.track).toBe('trk_01');
    expect(ext?.criteria?.[0]?.weight).toBe(2);
  });

  it('lists every problem at once and refers to the file by path', () => {
    try {
      parse({
        version: 2,
        prizes: [{ name: '', track: 'trk_99' }],
        criteria: [{ key: 'x', label: 'X', weight: -1, min: 5, max: 1, order: 0 }],
        projects: { prj_99: { tech_tags: [1] } },
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExtensionError);
      expect((e as ExtensionError).problems).toEqual([
        'evenhand.version must be 1',
        'evenhand.prizes[0].name is required',
        'evenhand.prizes[0] refers to unknown track trk_99',
        'evenhand.criteria[0].weight must not be negative',
        'evenhand.criteria[0].min must not exceed max',
        'evenhand.projects.prj_99 refers to unknown project',
        'evenhand.projects.prj_99.tech_tags must be a list of strings',
      ]);
    }
  });
});
