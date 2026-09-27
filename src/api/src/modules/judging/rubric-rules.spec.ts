import { keyFromLabel, lockedChanges, rubricProblems } from './rubric-rules.js';

const c = (key: string, weight = 1, min = 1, max = 5) => ({ key, label: key, weight, min, max });

describe('keyFromLabel', () => {
  it.each([
    ['Technical depth!', 'technical_depth'],
    ['Café crème', 'cafe_creme'],
    ['3D polish', 'c_3d_polish'],
    ['???', 'c_criterion'],
  ])('%j → %j', (label, key) => expect(keyFromLabel(label)).toBe(key));
});

describe('rubricProblems', () => {
  it('accepts a sensible rubric', () => {
    expect(rubricProblems([c('impact', 2), c('quality', 1)])).toEqual([]);
  });

  it('lists every problem', () => {
    expect(rubricProblems([c('a', 0), c('a', 0, 5, 5)])).toEqual([
      'two criteria share the key "a"',
      '"a": min must be below max',
      'at least one criterion needs a weight above 0',
    ]);
  });
});

describe('lockedChanges', () => {
  const stored = [
    { ...c('impact'), scored: true },
    { ...c('quality'), scored: true },
  ];

  it('allows new weights and labels at any time', () => {
    const next = [{ ...c('impact', 3), label: 'Impact on people' }, c('quality', 1)];
    expect(lockedChanges(stored, next, true)).toEqual([]);
  });

  it('refuses removing, re-ranging or adding once reviews are final', () => {
    expect(lockedChanges(stored, [c('impact', 1, 0, 10), c('novelty')], true)).toEqual([
      '"impact" already has scores, so its range 1–5 is fixed',
      '"quality" already has scores and cannot be removed',
      '"novelty" cannot be added: finished reviews would have no score for it',
    ]);
  });

  it('allows anything before judging starts', () => {
    const fresh = stored.map((s) => ({ ...s, scored: false }));
    expect(lockedChanges(fresh, [c('novelty', 1, 0, 10)], false)).toEqual([]);
  });
});
