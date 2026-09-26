import type { Criterion, ReviewInput, WeightedReview } from './types.js';

export class RubricError extends Error {
  override readonly name = 'RubricError';
}

/**
 * Weighted score of one review on the criterion scale (BUILD-PLAN §7.1):
 *
 *   s = Σ_c w_c · x_c / Σ_c w_c
 *
 * Every criterion must be present and inside [min, max]. A missing or out-of-range value
 * is an error, not a zero: silently scoring it as zero would move a project's rank.
 */
export function weightedScore(
  criteria: readonly Criterion[],
  values: ReviewInput['values'],
): number {
  if (criteria.length === 0) {
    throw new RubricError('rubric has no criteria');
  }
  let weightSum = 0;
  let total = 0;
  for (const c of criteria) {
    if (!(c.weight >= 0) || !Number.isFinite(c.weight)) {
      throw new RubricError(`criterion "${c.key}" has an invalid weight: ${c.weight}`);
    }
    const x = values[c.key];
    if (x === undefined) {
      throw new RubricError(`missing value for criterion "${c.key}"`);
    }
    if (!Number.isFinite(x) || x < c.min || x > c.max) {
      throw new RubricError(`value ${x} for "${c.key}" is outside [${c.min}, ${c.max}]`);
    }
    weightSum += c.weight;
    total += c.weight * x;
  }
  if (weightSum === 0) {
    throw new RubricError('criterion weights sum to zero');
  }
  return total / weightSum;
}

/** Weighted score for every review, preserving input order. */
export function weightReviews(
  criteria: readonly Criterion[],
  reviews: readonly ReviewInput[],
): WeightedReview[] {
  return reviews.map((r) => ({
    judgeId: r.judgeId,
    projectId: r.projectId,
    score: weightedScore(criteria, r.values),
  }));
}
