import { describe, expect, it } from 'vitest';
import { isFlat, mean, spread } from './stats.js';

describe('stats', () => {
  it('mean and spread', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(spread([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(() => mean([])).toThrow(RangeError);
  });

  it('flags a judge who gives every project the same marks (fixture jdg_07: 4/4/4 × 3)', () => {
    const same = { functionality: 4, quality: 4, innovation: 4 };
    expect(isFlat([same, same, { innovation: 4, quality: 4, functionality: 4 }])).toBe(true);
  });

  it('does not flag different marks that happen to average the same (fixture jdg_19)', () => {
    expect(
      isFlat([
        { functionality: 3, quality: 5, innovation: 3 },
        { functionality: 3, quality: 4, innovation: 4 },
        { functionality: 5, quality: 4, innovation: 2 },
      ]),
    ).toBe(false);
  });

  it('does not flag two reviews: too few to tell', () => {
    const same = { impact: 4 };
    expect(isFlat([same, same])).toBe(false);
  });
});
