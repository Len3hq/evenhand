/** Small, exact statistics for judging. Pure. */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new RangeError('mean of no values');
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Population standard deviation (divides by n): how spread a judge's own scores are. */
export function spread(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/** Fewest final reviews before "the same marks every time" means anything. */
export const FLAT_MIN_REVIEWS = 3;

/**
 * True when a judge gave every project exactly the same marks, criterion by criterion, across
 * at least FLAT_MIN_REVIEWS reviews (fixture jdg_07: 4/4/4 three times): their marks say nothing
 * about how the projects differ.
 *
 * Deliberately not "the same weighted score": different marks can average out equal by chance
 * (fixture jdg_19 gives 3/5/3, 3/4/4 and 5/4/2, all 3.67), and that judge did tell projects
 * apart.
 */
export function isFlat(marks: readonly Readonly<Record<string, number>>[]): boolean {
  if (marks.length < FLAT_MIN_REVIEWS) return false;
  const key = (m: Readonly<Record<string, number>>) =>
    JSON.stringify(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));
  const first = key(marks[0]!);
  return marks.every((m) => key(m) === first);
}
