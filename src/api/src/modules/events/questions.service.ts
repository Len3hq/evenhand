import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { eventByRef } from '../../core/refs.js';
import type { CustomQuestion } from '../../generated/prisma/client.js';
import type { QuestionDto, QuestionsDto, QuestionsInputDto } from './dto/question.dto.js';
import { manageableEvent } from './manageable-event.js';
import {
  lockedQuestionChanges,
  questionProblems,
  type QuestionSpec,
  type StoredQuestion,
} from './question-rules.js';

/**
 * An event's custom questions, part of the T1 submission field set. Public to read, so a team
 * knows what it will be asked; its event's organisers and admins change them, subject to
 * question-rules.ts once teams have answered or submitted.
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(eventRef: string): Promise<QuestionsDto> {
    const event = await this.prisma.event.findFirst({ where: eventByRef(eventRef) });
    if (!event) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such event.');
    return { questions: (await questionsOf(this.prisma, event.id)).map(toDto) };
  }

  async replace(actor: Actor, eventRef: string, dto: QuestionsInputDto): Promise<QuestionsDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);

    await this.prisma.$transaction(async (tx) => {
      // Answers are written under a share lock on the event (answers.ts), so no answer can
      // land on a question this transaction is about to delete.
      await tx.$queryRaw`SELECT 1 FROM "events" WHERE "id" = ${event.id}::uuid FOR UPDATE`;
      const rows = await questionsOf(tx, event.id);
      // A row may name its question by id or by the id it was imported under.
      const idOf = new Map<string, string>();
      for (const r of rows) {
        idOf.set(r.id, r.id);
        if (r.externalId) idOf.set(r.externalId, r.id);
      }
      const next: QuestionSpec[] = dto.questions.map((q) => ({
        id: q.id === undefined ? null : (idOf.get(q.id) ?? q.id),
        prompt: q.prompt.trim(),
        required: q.required ?? false,
        isPublic: q.isPublic ?? false,
      }));
      const problems = questionProblems(next, new Set(rows.map((r) => r.id)));
      if (problems.length) {
        throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', problems.join('; '));
      }

      const live = { eventId: event.id, status: 'SUBMITTED', supersededById: null } as const;
      const stored: StoredQuestion[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          prompt: r.prompt,
          required: r.required,
          isPublic: r.isPublic,
          answers: await tx.answer.count({ where: { questionId: r.id } }),
          unansweredSubmitted: await tx.submission.count({
            where: { ...live, answers: { none: { questionId: r.id } } },
          }),
        })),
      );
      const submitted = await tx.submission.count({ where: live });
      const locked = lockedQuestionChanges(stored, next, submitted);
      if (locked.length) {
        throw new DomainError(HttpStatus.CONFLICT, 'questions_locked', locked.join('; '));
      }
      if (sameQuestions(rows, next)) return;

      const keep = new Set(next.flatMap((q) => (q.id ? [q.id] : [])));
      await tx.customQuestion.deleteMany({
        where: { eventId: event.id, id: { notIn: [...keep] } },
      });
      const saved: CustomQuestion[] = [];
      for (const [order, q] of next.entries()) {
        const data = { prompt: q.prompt, required: q.required, isPublic: q.isPublic, order };
        saved.push(
          q.id
            ? await tx.customQuestion.update({ where: { id: q.id }, data })
            : await tx.customQuestion.create({ data: { eventId: event.id, ...data } }),
        );
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'questions.updated',
        targetType: 'event',
        targetId: event.id,
        before: snapshot(rows),
        after: snapshot(saved),
      });
    });
    return this.get(event.id);
  }
}

/** An event's questions in the order teams see them. */
export function questionsOf(db: Tx | PrismaService, eventId: string): Promise<CustomQuestion[]> {
  return db.customQuestion.findMany({
    where: { eventId },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
}

/** The audit snapshot: one entry per question, keyed by id, in order. */
function snapshot(list: readonly CustomQuestion[]) {
  return Object.fromEntries(
    list.map((q) => [q.id, { prompt: q.prompt, required: q.required, isPublic: q.isPublic }]),
  );
}

function sameQuestions(stored: readonly CustomQuestion[], next: readonly QuestionSpec[]): boolean {
  return (
    stored.length === next.length &&
    stored.every((s, i) => {
      const n = next[i]!;
      return (
        s.id === n.id &&
        s.prompt === n.prompt &&
        s.required === n.required &&
        s.isPublic === n.isPublic
      );
    })
  );
}

const toDto = (q: CustomQuestion): QuestionDto => ({
  id: q.id,
  externalId: q.externalId,
  prompt: q.prompt,
  required: q.required,
  isPublic: q.isPublic,
  order: q.order,
});
