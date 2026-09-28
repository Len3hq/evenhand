/**
 * The rules an event's custom questions follow, as pure functions, so they are unit-tested on
 * their own (the same split as the rubric: judging/rubric-rules.ts).
 */

/** Most questions an event can ask. */
export const MAX_QUESTIONS = 20;

export interface QuestionSpec {
  /** The stored question this row keeps, or null for a new one. */
  id: string | null;
  prompt: string;
  required: boolean;
  isPublic: boolean;
}

export interface StoredQuestion extends QuestionSpec {
  id: string;
  /** Answers given to it, in drafts and submitted entries alike. */
  answers: number;
  /** Submitted entries that have no answer to it. */
  unansweredSubmitted: number;
}

/** Problems that make the list invalid on its own (400). Empty when it is fine. */
export function questionProblems(
  next: readonly QuestionSpec[],
  storedIds: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const q of next) {
    if (!q.prompt) problems.push('a question needs a prompt');
    const same = q.prompt.toLowerCase();
    if (q.prompt && prompts.has(same)) problems.push(`"${q.prompt}" is asked twice`);
    prompts.add(same);
    if (q.id === null) continue;
    if (!storedIds.has(q.id)) problems.push(`no question ${q.id} in this event`);
    else if (ids.has(q.id)) problems.push(`question ${q.id} is listed twice`);
    ids.add(q.id);
  }
  return problems;
}

/**
 * Changes that would break what teams have already written (409). Prompts may be reworded and
 * questions made optional or private at any time; the audit trail keeps the old wording.
 *
 * - An answered question cannot be removed: that would delete teams' work.
 * - An answered private question cannot become public: those answers were given in private.
 * - A question cannot become required while a submitted entry has no answer to it: that entry
 *   would break the rule it was accepted under. `submitted` counts the event's submitted
 *   entries, which is what a new question is missing from.
 */
export function lockedQuestionChanges(
  stored: readonly StoredQuestion[],
  next: readonly QuestionSpec[],
  submitted: number,
): string[] {
  const problems: string[] = [];
  const nextById = new Map(next.filter((q) => q.id !== null).map((q) => [q.id!, q]));
  const entries = (n: number): string => `${n} submitted ${n === 1 ? 'entry has' : 'entries have'}`;

  for (const s of stored) {
    const n = nextById.get(s.id);
    if (!n) {
      if (s.answers > 0) {
        problems.push(`"${s.prompt}" has ${plural(s.answers, 'answer')} and cannot be removed`);
      }
      continue;
    }
    if (n.isPublic && !s.isPublic && s.answers > 0) {
      problems.push(`"${s.prompt}" was answered in private, so it cannot be made public`);
    }
    if (n.required && !s.required && s.unansweredSubmitted > 0) {
      problems.push(
        `"${s.prompt}" cannot become required: ${entries(s.unansweredSubmitted)} no answer to it`,
      );
    }
  }
  if (submitted > 0) {
    for (const n of next) {
      if (n.id === null && n.required) {
        problems.push(`"${n.prompt}" cannot be added as required: ${entries(submitted)} no answer`);
      }
    }
  }
  return problems;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
