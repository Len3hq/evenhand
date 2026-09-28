import { RubricError, weightedScore } from '@evenhand/judging-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { isUuid } from '../../core/refs.js';
import type { Criterion, Event, Submission } from '../../generated/prisma/client.js';
import type { JudgeQueueDto, ReviewDto, ReviewState, SaveReviewDto } from './dto/review.dto.js';
import { IN_JUDGING } from './in-judging.js';

/**
 * The judge console (T2). A judge reaches only their own assignments: every lookup is "this
 * assignment, where the judge is the caller", so anyone else gets the same 403 whether or not it
 * exists. Drafts are private working state; a submitted review is final.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** The caller's assignments in every event they judge, in queue order. */
  async queue(actor: Actor): Promise<JudgeQueueDto> {
    const rows = await this.prisma.assignment.findMany({
      // Only projects still in judging: a disqualified entry or a replaced or held duplicate
      // copy leaves the queue (its reviews stay on record).
      where: { judgeRole: { userId: actor.userId, role: 'JUDGE' }, submission: IN_JUDGING },
      include: {
        review: { select: { status: true } },
        submission: { select: { id: true, title: true, track: { select: { name: true } } } },
        judgeRole: { select: { event: true } },
      },
      orderBy: [{ queuePosition: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
    });
    const now = this.clock.now();
    const byEvent = new Map<string, JudgeQueueDto['events'][number]>();
    for (const a of rows) {
      const event = a.judgeRole.event;
      let group = byEvent.get(event.id);
      if (!group) {
        group = {
          eventId: event.id,
          eventName: event.name,
          eventSlug: event.slug,
          judgingClose: event.judgingClose?.toISOString() ?? null,
          judgingOpen: judgingOpen(event, now),
          assigned: 0,
          finished: 0,
          items: [],
        };
        byEvent.set(event.id, group);
      }
      const state = stateOf(a.review?.status);
      group.assigned++;
      if (state === 'FINAL') group.finished++;
      group.items.push({
        assignmentId: a.id,
        position: group.items.length,
        projectId: a.submission.id,
        title: a.submission.title,
        track: a.submission.track?.name ?? null,
        state,
      });
    }
    return {
      events: [...byEvent.values()].sort((a, b) => (a.eventName < b.eventName ? -1 : 1)),
    };
  }

  async get(actor: Actor, assignmentId: string): Promise<ReviewDto> {
    const a = await this.ownAssignment(actor, assignmentId);
    return this.present(a.id);
  }

  /** Saves a draft: some marks may be missing. Refused once final or after judging closes. */
  async save(actor: Actor, assignmentId: string, dto: SaveReviewDto): Promise<ReviewDto> {
    const a = await this.ownAssignment(actor, assignmentId);
    this.assertOpen(a.judgeRole.event);
    if (a.review?.status === 'FINAL') throw finalAlready();
    assertInJudging(a.submission);
    const criteria = await this.criteriaOf(a.judgeRole.eventId);
    const marks = checkMarks(criteria, dto.values);

    await this.prisma.$transaction(async (tx) => {
      const review =
        a.review ??
        (await tx.review.create({ data: { assignmentId: a.id, status: 'DRAFT', comment: '' } }));
      if (!a.review) {
        // Starting a review is audited once; later draft saves are private working state.
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: a.judgeRole.eventId,
          action: 'review.started',
          targetType: 'submission',
          targetId: a.submissionId,
        });
      }
      if (dto.comment !== undefined) {
        await tx.review.update({ where: { id: review.id }, data: { comment: dto.comment } });
      }
      for (const [criterionId, value] of marks) {
        if (value === null) {
          await tx.criterionScore.deleteMany({ where: { reviewId: review.id, criterionId } });
        } else {
          await tx.criterionScore.upsert({
            where: { reviewId_criterionId: { reviewId: review.id, criterionId } },
            create: { reviewId: review.id, criterionId, value },
            update: { value },
          });
        }
      }
    });
    return this.present(a.id);
  }

  /** Makes the review final: every criterion must be marked. Submitting again changes nothing. */
  async submit(actor: Actor, assignmentId: string): Promise<ReviewDto> {
    const a = await this.ownAssignment(actor, assignmentId);
    if (a.review?.status === 'FINAL') return this.present(a.id);
    this.assertOpen(a.judgeRole.event);
    assertInJudging(a.submission);
    const criteria = await this.criteriaOf(a.judgeRole.eventId);
    const values = marksByKey(criteria, a.review?.scores ?? []);
    const missing = criteria.filter((c) => values[c.key] === undefined).map((c) => c.label);
    if (!a.review || missing.length) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `Mark every criterion before submitting: ${(missing.length ? missing : criteria.map((c) => c.label)).join(', ')}.`,
      );
    }
    const review = a.review;
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: review.id },
        data: { status: 'FINAL', submittedAt: this.clock.now() },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: a.judgeRole.eventId,
        action: 'review.submitted',
        targetType: 'submission',
        targetId: a.submissionId,
        after: { values, comment: review.comment },
      });
    });
    return this.present(a.id);
  }

  /** Deny first: the only lookup is "this assignment of the caller's". */
  private async ownAssignment(actor: Actor, assignmentId: string) {
    const a = isUuid(assignmentId)
      ? await this.prisma.assignment.findFirst({
          where: { id: assignmentId, judgeRole: { userId: actor.userId, role: 'JUDGE' } },
          include: {
            review: { include: { scores: true } },
            judgeRole: { include: { event: true } },
            submission: true,
          },
        })
      : null;
    if (!a) throw forbidden('This is not one of your assignments.');
    return a;
  }

  private async present(assignmentId: string): Promise<ReviewDto> {
    const a = await this.prisma.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: {
        review: { include: { scores: true } },
        judgeRole: { include: { event: true } },
        submission: {
          include: {
            track: true,
            team: { select: { name: true } },
            answers: {
              include: { question: { select: { prompt: true } } },
              orderBy: [{ question: { order: 'asc' } }, { questionId: 'asc' }],
            },
          },
        },
      },
    });
    const criteria = await this.criteriaOf(a.judgeRole.eventId);
    const queue = await this.prisma.assignment.findMany({
      where: { judgeRoleId: a.judgeRoleId, submission: IN_JUDGING },
      select: { id: true },
      orderBy: [{ queuePosition: 'asc' }, { assignedAt: 'asc' }, { id: 'asc' }],
    });
    const at = queue.findIndex((q) => q.id === a.id);
    const values = marksByKey(criteria, a.review?.scores ?? []);
    const total = criteria.reduce((sum, c) => sum + c.weight, 0);
    let score: number | null = null;
    try {
      score = criteria.length ? weightedScore(criteria, values) : null;
    } catch (e) {
      if (!(e instanceof RubricError)) throw e;
    }
    const s = a.submission;
    return {
      assignmentId: a.id,
      eventId: a.judgeRole.eventId,
      eventName: a.judgeRole.event.name,
      position: at,
      queueLength: queue.length,
      // A project withdrawn from judging is not in the queue (at = -1): "next" is its start.
      previousAssignmentId: at > 0 ? queue[at - 1]!.id : null,
      nextAssignmentId: queue[at + 1]?.id ?? null,
      judgingOpen: judgingOpen(a.judgeRole.event, this.clock.now()),
      inJudging: isInJudging(s),
      project: {
        id: s.id,
        title: s.title,
        tagline: s.tagline,
        summary: s.summary,
        description: s.description,
        repoUrl: s.repoUrl,
        demoVideoUrl: s.demoVideoUrl,
        liveUrl: s.liveUrl,
        techTags: s.techTags,
        track: s.track?.name ?? null,
        teamName: s.team.name,
        answers: s.answers.map((x) => ({ prompt: x.question.prompt, value: x.value })),
      },
      criteria: criteria.map((c) => ({
        key: c.key,
        label: c.label,
        min: c.min,
        max: c.max,
        share: total > 0 ? c.weight / total : 0,
      })),
      state: stateOf(a.review?.status),
      values,
      comment: a.review?.comment ?? '',
      weightedScore: score,
      submittedAt: a.review?.submittedAt?.toISOString() ?? null,
    };
  }

  private criteriaOf(eventId: string): Promise<Criterion[]> {
    return this.prisma.criterion.findMany({
      where: { eventId },
      orderBy: [{ order: 'asc' }, { key: 'asc' }],
    });
  }

  private assertOpen(event: Event): void {
    if (!judgingOpen(event, this.clock.now())) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'judging_closed',
        `Judging closed at ${event.judgingClose!.toISOString()}.`,
      );
    }
  }
}

const isInJudging = (s: Submission): boolean =>
  s.status === IN_JUDGING.status &&
  s.eligibility === IN_JUDGING.eligibility &&
  s.supersededById === IN_JUDGING.supersededById &&
  s.duplicateHold === IN_JUDGING.duplicateHold;

/** A project disqualified or replaced after it was assigned takes no more reviews. */
function assertInJudging(s: Submission): void {
  if (!isInJudging(s)) {
    throw new DomainError(
      HttpStatus.CONFLICT,
      'not_in_judging',
      'This project is no longer in judging (disqualified, or replaced by a newer copy).',
    );
  }
}

const judgingOpen = (event: Event, now: Date): boolean =>
  !event.judgingClose || now < event.judgingClose;

const stateOf = (status: 'DRAFT' | 'FINAL' | undefined): ReviewState =>
  status === 'FINAL' ? 'FINAL' : status === 'DRAFT' ? 'DRAFT' : 'NOT_STARTED';

const finalAlready = () =>
  new DomainError(HttpStatus.CONFLICT, 'review_final', 'This review is submitted and final.');

/** Validates marks against the rubric: known keys, whole numbers in range, null clears. */
function checkMarks(
  criteria: readonly Criterion[],
  values: Record<string, unknown>,
): [string, number | null][] {
  const problems: string[] = [];
  const out: [string, number | null][] = [];
  for (const [key, value] of Object.entries(values)) {
    const c = criteria.find((x) => x.key === key);
    if (!c) {
      problems.push(`"${key}" is not a criterion of this event`);
    } else if (value === null) {
      out.push([c.id, null]);
    } else if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < c.min ||
      value > c.max
    ) {
      problems.push(`${c.label} must be a whole number from ${c.min} to ${c.max}`);
    } else {
      out.push([c.id, value]);
    }
  }
  if (problems.length) {
    throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', problems.join('; '));
  }
  return out;
}

/** Stored marks as `{ criterionKey: value }`. */
function marksByKey(
  criteria: readonly Criterion[],
  scores: readonly { criterionId: string; value: number }[],
): Record<string, number> {
  return Object.fromEntries(
    scores.flatMap((s) => {
      const c = criteria.find((x) => x.id === s.criterionId);
      return c ? [[c.key, s.value]] : [];
    }),
  );
}
