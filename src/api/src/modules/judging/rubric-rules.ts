/**
 * The rules a rubric must follow, as a pure function, so they are unit-tested on their own.
 */

export interface CriterionSpec {
  key: string;
  label: string;
  weight: number;
  min: number;
  max: number;
}

export interface StoredCriterion extends CriterionSpec {
  /** True if at least one review has a score for it. */
  scored: boolean;
}

/** "Technical depth!" → "technical_depth"; falls back to "criterion". */
export function keyFromLabel(label: string): string {
  const key = label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
  return /^[a-z]/.test(key) ? key : `c_${key || 'criterion'}`.slice(0, 40);
}

/** Problems that make a rubric invalid on its own (400). Empty when it is fine. */
export function rubricProblems(criteria: readonly CriterionSpec[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of criteria) {
    if (seen.has(c.key)) problems.push(`two criteria share the key "${c.key}"`);
    seen.add(c.key);
    if (c.min >= c.max) problems.push(`"${c.label}": min must be below max`);
  }
  if (criteria.length && criteria.reduce((s, c) => s + c.weight, 0) <= 0) {
    problems.push('at least one criterion needs a weight above 0');
  }
  return problems;
}

/**
 * Changes that would break existing reviews once judging has started (409). Weights and labels
 * may change; the set of criteria and the ranges of scored criteria may not.
 */
export function lockedChanges(
  stored: readonly StoredCriterion[],
  next: readonly CriterionSpec[],
  anyFinalReview: boolean,
): string[] {
  const problems: string[] = [];
  const nextByKey = new Map(next.map((c) => [c.key, c]));
  const storedKeys = new Set(stored.map((c) => c.key));
  for (const s of stored) {
    const n = nextByKey.get(s.key);
    if (!n && (s.scored || anyFinalReview)) {
      problems.push(`"${s.label}" already has scores and cannot be removed`);
    } else if (n && s.scored && (n.min !== s.min || n.max !== s.max)) {
      problems.push(`"${s.label}" already has scores, so its range ${s.min}–${s.max} is fixed`);
    }
  }
  if (anyFinalReview) {
    for (const n of next) {
      if (!storedKeys.has(n.key)) {
        problems.push(`"${n.label}" cannot be added: finished reviews would have no score for it`);
      }
    }
  }
  return problems;
}
