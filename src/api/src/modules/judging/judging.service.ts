import {
  type Criterion as EngineCriterion,
  RubricError,
  weightedScore,
} from '@evenhand/judging-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { type CsvCell, toCsv } from '../../core/csv.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef, eventByRef } from '../../core/refs.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ScoreDto, ScoreListDto } from './dto/scores.dto.js';

const REVIEW_INCLUDE = {
  scores: { include: { criterion: { select: { key: true } } } },
  assignment: {
    include: {
      judgeRole: { include: { user: { select: { name: true } } } },
      submission: {
        select: {
          id: true,
          externalId: true,
          title: true,
          eventId: true,
          seedOrder: true,
          track: { select: { id: true, externalId: true } },
        },
      },
    },
  },
} satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

@Injectable()
export class JudgingService {
  constructor(private readonly prisma: PrismaService) {}

  /** The caller's own reviews, across every event they judge. (Acceptance check 4.) */
  async ownScores(actor: Actor): Promise<ScoreListDto> {
    const judgeRoleIds = actor.judgeGrants.map((g) => g.id);
    return this.scoresFor({ assignment: { judgeRoleId: { in: judgeRoleIds } } });
  }

  /**
   * One judge's reviews. Allowed for that judge, and for organisers of that judge's event
   * (and admins). Everyone else gets 403 (acceptance check 5).
   *
   * Deny first: a caller who is neither this judge nor an organiser anywhere is refused
   * before the database is asked whether the judge even exists, so the answer leaks nothing
   * and is never a 404.
   */
  async judgeScores(actor: Actor, judgeRef: string): Promise<ScoreListDto> {
    const isSelf = actor.ownsJudgeRef(judgeRef);
    if (!isSelf && !actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) {
      throw forbidden('You can only see your own scores.');
    }

    const judges = await this.prisma.eventRole.findMany({
      where: { role: 'JUDGE', ...byRef(judgeRef) },
      select: { id: true, eventId: true },
    });
    if (judges.length > 1) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'ambiguous_reference',
        'Use the internal judge id.',
      );
    }
    const judge = judges[0];
    if (!judge) {
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such judge.');
    }
    if (!isSelf && !actor.canManageEvent(judge.eventId)) {
      throw forbidden('You can only see your own scores.');
    }
    return this.scoresFor({ assignment: { judgeRoleId: judge.id } });
  }

  /**
   * Every review in an event as CSV, for organisers (acceptance check 7). One row per review;
   * one column per criterion in rubric order; superseded reviews are included and marked.
   */
  async exportScoresCsv(
    actor: Actor,
    eventRef: string,
  ): Promise<{ filename: string; csv: string }> {
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const event = await this.prisma.event.findFirst({
      where: eventByRef(eventRef),
      include: { criteria: { orderBy: [{ order: 'asc' }, { key: 'asc' }] } },
    });
    if (!event) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such event.');
    if (!actor.canManageEvent(event.id)) throw forbidden();

    const reviews = await this.prisma.review.findMany({
      where: { assignment: { submission: { eventId: event.id } } },
      include: REVIEW_INCLUDE,
    });
    reviews.sort(compareForExport);

    const keys = event.criteria.map((c) => c.key);
    const header = [
      'event_id',
      'judge_id',
      'judge_name',
      'project_id',
      'project_title',
      'track_id',
      ...keys,
      'weighted_score',
      'status',
      'superseded',
      'comment',
    ];
    const rows = reviews.map((r): CsvCell[] => {
      const dto = this.toDto(r, event.criteria);
      const sub = r.assignment.submission;
      return [
        event.externalId ?? event.id,
        dto.judge.externalId ?? dto.judge.id,
        dto.judge.name,
        dto.project.externalId ?? dto.project.id,
        dto.project.title,
        sub.track?.externalId ?? sub.track?.id ?? '',
        ...keys.map((k) => dto.values[k] ?? ''),
        dto.weightedScore === null ? '' : round(dto.weightedScore, 4),
        dto.status,
        dto.superseded,
        dto.comment,
      ];
    });
    return { filename: `${event.slug}-scores.csv`, csv: toCsv(header, rows) };
  }

  private async scoresFor(where: Prisma.ReviewWhereInput): Promise<ScoreListDto> {
    const reviews = await this.prisma.review.findMany({ where, include: REVIEW_INCLUDE });
    reviews.sort(compareForExport);
    const eventIds = [...new Set(reviews.map((r) => r.assignment.submission.eventId))];
    const criteria = await this.prisma.criterion.findMany({ where: { eventId: { in: eventIds } } });
    return {
      items: reviews.map((r) =>
        this.toDto(
          r,
          criteria.filter((c) => c.eventId === r.assignment.submission.eventId),
        ),
      ),
    };
  }

  private toDto(r: ReviewRow, criteria: readonly EngineCriterion[]): ScoreDto {
    const values = Object.fromEntries(r.scores.map((s) => [s.criterion.key, s.value]));
    let score: number | null = null;
    try {
      score = weightedScore(criteria, values);
    } catch (e) {
      // Incomplete drafts have no weighted score yet; anything else is a real bug.
      if (!(e instanceof RubricError)) throw e;
    }
    const { judgeRole, submission } = r.assignment;
    return {
      reviewId: r.id,
      eventId: submission.eventId,
      judge: { id: judgeRole.id, externalId: judgeRole.externalId, name: judgeRole.user.name },
      project: { id: submission.id, externalId: submission.externalId, title: submission.title },
      status: r.status,
      superseded: r.superseded,
      comment: r.comment,
      values,
      weightedScore: score,
    };
  }
}

/** Stable order: judge (fixture id, then id), then project (fixture order, then id). */
function compareForExport(a: ReviewRow, b: ReviewRow): number {
  const ja = a.assignment.judgeRole.externalId ?? a.assignment.judgeRole.id;
  const jb = b.assignment.judgeRole.externalId ?? b.assignment.judgeRole.id;
  if (ja !== jb) return ja < jb ? -1 : 1;
  const sa = a.assignment.submission.seedOrder ?? Number.MAX_SAFE_INTEGER;
  const sb = b.assignment.submission.seedOrder ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  return a.assignment.submission.id < b.assignment.submission.id ? -1 : 1;
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
