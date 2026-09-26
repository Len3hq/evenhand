import { describe, expect, it } from 'vitest';
import { RubricError, weightedScore } from './weighted.js';

const equalThirds = [
  { key: 'functionality', weight: 1, min: 1, max: 5 },
  { key: 'innovation', weight: 1, min: 1, max: 5 },
  { key: 'quality', weight: 1, min: 1, max: 5 },
];

describe('weightedScore', () => {
  it('averages equally weighted criteria', () => {
    expect(weightedScore(equalThirds, { functionality: 4, innovation: 3, quality: 5 })).toBe(4);
  });

  it('normalises weights by their sum', () => {
    const criteria = [
      { key: 'a', weight: 3, min: 1, max: 5 },
      { key: 'b', weight: 1, min: 1, max: 5 },
    ];
    // (3·5 + 1·1) / 4 = 4
    expect(weightedScore(criteria, { a: 5, b: 1 })).toBe(4);
  });

  it('gives the flat judge jdg_07 (4/4/4) exactly 4', () => {
    expect(weightedScore(equalThirds, { functionality: 4, innovation: 4, quality: 4 })).toBe(4);
  });

  it('rejects a missing criterion instead of scoring it as zero', () => {
    expect(() => weightedScore(equalThirds, { functionality: 4, innovation: 3 })).toThrow(
      RubricError,
    );
  });

  it('rejects values outside the criterion range', () => {
    expect(() =>
      weightedScore(equalThirds, { functionality: 6, innovation: 3, quality: 3 }),
    ).toThrow(/outside/);
  });

  it('rejects weights that sum to zero', () => {
    const zero = equalThirds.map((c) => ({ ...c, weight: 0 }));
    expect(() => weightedScore(zero, { functionality: 3, innovation: 3, quality: 3 })).toThrow(
      /sum to zero/,
    );
  });
});
