import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../../core/errors.js';
import type { Tx } from '../../core/prisma.service.js';
import type { CustomQuestion } from '../../generated/prisma/client.js';
import { questionsOf } from '../events/questions.service.js';

export interface AnswerInput {
  question: string;
  value: string | null;
}

/** Audit fragments, keyed by a readable label per question: only answers that changed. */
export interface AnswerChanges {
  before: Record<string, string | null>;
  after: Record<string, string | null>;
}

/**
 * Writes a submission's answers to its event's questions. `null` or blank text clears an answer
 * (its row is deleted); questions left out keep their answer. Runs inside the caller's
 * transaction, under a share lock on the event, so an organiser cannot delete a question
 * between our check and our write (questions.service.ts takes the matching update lock).
 */
export async function writeAnswers(
  tx: Tx,
  submissionId: string,
  eventId: string,
  inputs: readonly AnswerInput[],
): Promise<AnswerChanges> {
  const changes: AnswerChanges = { before: {}, after: {} };
  if (!inputs.length) return changes;

  await tx.$queryRaw`SELECT 1 FROM "events" WHERE "id" = ${eventId}::uuid FOR SHARE`;
  const questions = await questionsOf(tx, eventId);
  const byRef = new Map<string, CustomQuestion>();
  for (const q of questions) {
    byRef.set(q.id, q);
    if (q.externalId) byRef.set(q.externalId, q);
  }
  const seen = new Set<string>();
  const wanted = inputs.map((input) => {
    const q = byRef.get(input.question);
    if (!q) throw invalid(`Unknown question ${input.question} for this event.`);
    if (seen.has(q.id)) throw invalid(`"${q.prompt}" is answered twice.`);
    seen.add(q.id);
    return { q, value: input.value?.trim() || null };
  });

  const stored = new Map(
    (await tx.answer.findMany({ where: { submissionId, questionId: { in: [...seen] } } })).map(
      (a) => [a.questionId, a.value],
    ),
  );
  for (const { q, value } of wanted) {
    const old = stored.get(q.id) ?? null;
    if (old === value) continue;
    const key = { submissionId_questionId: { submissionId, questionId: q.id } };
    if (value === null) await tx.answer.delete({ where: key });
    else {
      await tx.answer.upsert({
        where: key,
        create: { submissionId, questionId: q.id, value },
        update: { value },
      });
    }
    changes.before[answerLabel(q)] = old;
    changes.after[answerLabel(q)] = value;
  }
  return changes;
}

/**
 * What a submission still needs before it counts as complete: a title and a summary (the
 * gallery card shows both) and an answer to every required question. Empty when complete.
 */
export async function missingToSubmit(
  tx: Tx,
  s: { id: string; eventId: string; title: string; summary: string | null },
): Promise<string[]> {
  const missing = (['title', 'summary'] as const).filter((k) => !s[k]?.trim());
  const unanswered = await tx.customQuestion.findMany({
    where: { eventId: s.eventId, required: true, answers: { none: { submissionId: s.id } } },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: { prompt: true },
  });
  return [...missing, ...unanswered.map((q) => `an answer to "${q.prompt}"`)];
}

/** "answer 2 (What did you build this weekend?)": unique per event, readable in the trail. */
function answerLabel(q: CustomQuestion): string {
  const prompt = q.prompt.length > 40 ? `${q.prompt.slice(0, 39)}…` : q.prompt;
  return `answer ${q.order + 1} (${prompt})`;
}

const invalid = (message: string): DomainError =>
  new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', message);
