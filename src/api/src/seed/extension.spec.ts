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
      questions: [
        { id: 'q_build', prompt: 'What did you build?', required: true, is_public: true, order: 0 },
      ],
      projects: {
        prj_01: { tagline: 'Short', tech_tags: ['ts'], answers: { q_build: 'A tool' } },
      },
    });
    expect(ext?.prizes?.[0]?.track).toBe('trk_01');
    expect(ext?.criteria?.[0]?.weight).toBe(2);
    expect(ext?.questions?.[0]).toMatchObject({ id: 'q_build', required: true, is_public: true });
    expect(ext?.projects?.prj_01?.answers).toEqual({ q_build: 'A tool' });
  });

  it('checks questions and the answers that refer to them', () => {
    try {
      parse({
        version: 1,
        questions: [
          { id: 'q1', prompt: 'Who?', required: 'yes', is_public: false, order: 0 },
          { id: 'q1', prompt: 'WHO?', required: false, is_public: false, order: 1 },
          { id: '', prompt: ' ', required: false, is_public: false, order: 2 },
        ],
        projects: { prj_01: { answers: { q1: '  ', q9: 'Ada' } } },
      });
      expect.unreachable();
    } catch (e) {
      expect((e as ExtensionError).problems).toEqual([
        'evenhand.questions[0].required must be true or false',
        'evenhand.questions[1].id q1 is used twice',
        'evenhand.questions[1].prompt is asked twice',
        'evenhand.questions[2].id is required',
        'evenhand.questions[2].prompt must be 1–300 characters',
        'evenhand.projects.prj_01.answers.q1 must be 1–5000 characters of text',
        'evenhand.projects.prj_01.answers.q9 refers to unknown question',
      ]);
    }
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
