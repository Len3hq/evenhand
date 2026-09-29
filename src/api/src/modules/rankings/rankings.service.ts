import { createHash } from 'node:crypto';
import { normalize, RubricError, tieGroups, weightedScore } from '@evenhand/judging-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { type CsvCell, toCsv } from '../../core/csv.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { eventByRef, isUuid } from '../../core/refs.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import { IN_JUDGING } from '../judging/in-judging.js';
import { CONTENT_INCLUDE, reviewsOfOlderVersion } from '../submissions/content-hash.js';
import type {
  ChangedAfterReviewDto,
  PendingDuplicateDto,
  PublicResultsDto,
  RankingDto,
  RankingParamsDto,
  RankingRowDto,
  RankingSummaryDto,
} from './dto/ranking.dto.js';

export const METHOD = 'joint-ridge-v1';
/** Fewer final reviews than this and a project is listed, never ranked (decision 54). */
const MIN_REVIEWS_TO_RANK = 2;
const NOTABLE = 0.05;

interface Inputs {
  criteria: { key: string; weight: number; min: number; max: number }[];
  reviews: { judge: string; project: string; values: Record<string, number> }[];
}

/**
 * Ranking runs (BUILD-PLAN §7.3): the normalisation model applied to an event's final reviews,
 * stored with hashes of its inputs and result, a reason per project, and tie groups. Publishing
 * freezes one run and opens the public results; a run whose inputs have changed since cannot
 * be published.
 */
@Injectable()
export class RankingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Computes and stores a new run. The event's organisers and admins. */
  async run(actor: Actor, eventRef: string): Promise<RankingDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const inputs = await this.inputsOf(event.id);
    if (inputs.reviews.length === 0) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'nothing_to_rank',
        'There are no submitted reviews to rank yet.',
      );
    }
    let scored: { judgeId: string; projectId: string; score: number }[];
    try {
      scored = inputs.reviews.map((r) => ({
        judgeId: r.judge,
        projectId: r.project,
        score: weightedScore(inputs.criteria, r.values),
      }));
    } catch (e) {
      if (e instanceof RubricError) {
        throw new DomainError(HttpStatus.CONFLICT, 'nothing_to_rank', e.message);
      }
      throw e;
    }

    const fit = normalize(scored);
    const projects = await this.prisma.submission.findMany({
      where: { eventId: event.id, ...IN_JUDGING },
      select: { id: true, submittedAt: true },
    });
    const submittedAt = new Map(projects.map((p) => [p.id, p.submittedAt?.getTime() ?? 0]));
    const bias = new Map(fit.judges.map((j) => [j.judgeId, j.bias]));
    const reviewersOf = new Map<string, string[]>();
    for (const s of scored) {
      reviewersOf.set(s.projectId, [...(reviewersOf.get(s.projectId) ?? []), s.judgeId]);
    }

    // Decision 11: normalized score, then raw mean, then review count, then earliest submission.
    const order = [...fit.projects].sort(
      (a, b) =>
        b.normalized - a.normalized ||
        b.raw - a.raw ||
        b.reviews - a.reviews ||
        (submittedAt.get(a.projectId) ?? 0) - (submittedAt.get(b.projectId) ?? 0) ||
        (a.projectId < b.projectId ? -1 : 1),
    );
    const ranked = order.filter((p) => p.reviews >= MIN_REVIEWS_TO_RANK);
    const listed = order.filter((p) => p.reviews < MIN_REVIEWS_TO_RANK);
    const groups = tieGroups(ranked);

    const rows = [
      ...ranked.map((p, i) => ({
        submissionId: p.projectId,
        rawMean: p.raw,
        normalized: p.normalized,
        posteriorSd: p.sd,
        rank: i + 1,
        tieGroup: groups[i]!,
        nReviews: p.reviews,
        reason: reasonFor(p, reviewersOf.get(p.projectId) ?? [], bias),
      })),
      ...listed.map((p, i) => ({
        submissionId: p.projectId,
        rawMean: p.raw,
        normalized: p.normalized,
        posteriorSd: p.sd,
        // Stored after the ranked projects, with no tie group: listed, not ranked.
        rank: ranked.length + i + 1,
        tieGroup: 0,
        nReviews: p.reviews,
        reason: `Not ranked: only ${p.reviews} submitted review${p.reviews === 1 ? '' : 's'}.`,
      })),
    ];
    const reviewed = new Set(fit.projects.map((p) => p.projectId));
    const pendingDuplicates = await this.pendingDuplicates(event.id);
    const changedAfterReview = await this.changedAfterReview(event.id);
    const params: RankingParamsDto = {
      method: METHOD,
      weights: Object.fromEntries(inputs.criteria.map((c) => [c.key, c.weight])),
      lambdaB: fit.lambdaB,
      lambdaQ: fit.lambdaQ,
      atEdge: fit.atEdge,
      looMse: fit.looMse,
      meanOnlyLooMse: fit.meanOnlyLooMse,
      reviews: scored.length,
      unreviewed: projects
        .map((p) => p.id)
        .filter((id) => !reviewed.has(id))
        .sort(),
      pendingDuplicates,
      changedAfterReview,
    };
    const inputsHash = hash(inputs);
    const outputHash = hash(
      rows.map((r) => ({
        ...r,
        rawMean: round(r.rawMean),
        normalized: round(r.normalized),
        posteriorSd: round(r.posteriorSd),
      })),
    );

    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rankingRun.create({
        data: {
          eventId: event.id,
          method: METHOD,
          params: params as unknown as Prisma.InputJsonValue,
          inputsHash,
          outputHash,
          createdById: actor.userId,
          rows: { create: rows },
        },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'ranking.run',
        targetType: 'ranking',
        targetId: created.id,
        after: {
          method: METHOD,
          ranked: ranked.length,
          listed: listed.length,
          tieGroups: new Set(groups).size,
          lambdaB: fit.lambdaB,
          lambdaQ: fit.lambdaQ,
          inputsHash,
          outputHash,
        },
      });
      return created;
    });
    return this.get(actor, run.id);
  }

  /** The event's runs, newest first. */
  async list(actor: Actor, eventRef: string): Promise<RankingSummaryDto[]> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const runs = await this.prisma.rankingRun.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'desc' },
    });
    const current = hash(await this.inputsOf(event.id));
    return runs.map((r) => summary(r, current));
  }

  /** One run with every row: the receipt. Organisers of its event and admins. */
  async get(actor: Actor, runId: string): Promise<RankingDto> {
    const run = await this.ownRun(actor, runId);
    const current = hash(await this.inputsOf(run.eventId));
    return { ...summary(run, current), rows: await this.rowsOf(run.id) };
  }

  /**
   * Publishes a run: it becomes the event's public results. Refused when the reviews or weights
   * have changed since it was computed (409 `ranking_stale`): run it again first.
   */
  async publish(actor: Actor, runId: string): Promise<RankingDto> {
    const run = await this.ownRun(actor, runId);
    // An undecided duplicate means some reviews are set aside (a held copy) or a project may be
    // counted twice (two live copies). Results go public only once every flag is decided.
    const pending = await this.pendingDuplicates(run.eventId);
    if (pending.length) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'duplicates_pending',
        `Decide the suspected duplicate${pending.length === 1 ? '' : 's'} first (${pending
          .map((p) => `${p.held} / ${p.kept}`)
          .join('; ')}), then run the ranking again and publish.`,
      );
    }
    if (hash(await this.inputsOf(run.eventId)) !== run.inputsHash) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'ranking_stale',
        'Reviews or weights have changed since this ranking was run. Run it again, then publish.',
      );
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.rankingRun.update({ where: { id: run.id }, data: { publishedAt: now } });
      await tx.event.update({ where: { id: run.eventId }, data: { resultsPublishedAt: now } });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: run.eventId,
        action: 'ranking.published',
        targetType: 'ranking',
        targetId: run.id,
        after: { inputsHash: run.inputsHash, outputHash: run.outputHash },
      });
      // Anchor the audit chain in the published results: the head right after this publish
      // entry. It goes public with the results, so rewriting history from any earlier point
      // (which changes every later hash) makes it vanish from the log, visibly.
      const head = await tx.auditChainHead.findUniqueOrThrow({ where: { id: 1 } });
      await tx.rankingRun.update({ where: { id: run.id }, data: { auditHead: head.hash } });
    });
    return this.get(actor, run.id);
  }

  /** Public once the event has published results; 404 before, whoever asks. */
  async results(eventRef: string): Promise<PublicResultsDto> {
    const event = await this.prisma.event.findFirst({ where: eventByRef(eventRef) });
    const run =
      event?.resultsPublishedAt &&
      (await this.prisma.rankingRun.findFirst({
        where: { eventId: event.id, publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
      }));
    if (!event || !run) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'results_not_published',
        'Results for this event have not been published.',
      );
    }
    const rows = await this.rowsOf(run.id);
    const auditHeadInLog = run.auditHead
      ? (await this.prisma.auditLog.count({ where: { hash: run.auditHead } })) > 0
      : null;
    return {
      eventId: event.id,
      eventName: event.name,
      publishedAt: run.publishedAt!.toISOString(),
      auditHead: run.auditHead,
      auditHeadInLog,
      method: run.method,
      inputsHash: run.inputsHash,
      outputHash: run.outputHash,
      tieGroups: new Set(rows.flatMap((r) => (r.tieGroup ? [r.tieGroup] : []))).size,
      rows,
    };
  }

  /** The published run (else the newest) as CSV. Organisers and admins. */
  async resultsCsv(actor: Actor, eventRef: string): Promise<{ filename: string; csv: string }> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const run =
      (await this.prisma.rankingRun.findFirst({
        where: { eventId: event.id, publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
      })) ??
      (await this.prisma.rankingRun.findFirst({
        where: { eventId: event.id },
        orderBy: { createdAt: 'desc' },
      }));
    if (!run) {
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No ranking has been run yet.');
    }
    const rows = await this.rowsOf(run.id);
    const header = [
      'rank',
      'tie_group',
      'project_id',
      'title',
      'team',
      'track',
      'reviews',
      'raw_mean',
      'normalized',
      'sd',
      'move',
      'reason',
      'run_id',
      'published',
    ];
    const cells = rows.map((r): CsvCell[] => [
      r.rank ?? '',
      r.tieGroup ?? '',
      r.externalId ?? r.projectId,
      r.title,
      r.teamName,
      r.track ?? '',
      r.reviews,
      round(r.rawMean),
      round(r.normalized),
      round(r.sd),
      r.move ?? '',
      r.reason,
      run.id,
      run.publishedAt !== null,
    ]);
    return { filename: `${event.slug}-results.csv`, csv: toCsv(header, cells) };
  }

  /** Projects in judging with final reviews of an earlier version (see content-hash.ts). */
  private async changedAfterReview(eventId: string): Promise<ChangedAfterReviewDto[]> {
    const rows = await this.prisma.submission.findMany({
      where: { eventId, ...IN_JUDGING },
      include: {
        ...CONTENT_INCLUDE,
        assignments: {
          select: { review: { select: { status: true, superseded: true, contentHash: true } } },
        },
      },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return rows
      .map((s) => ({
        project: s.externalId ? `${s.title} (${s.externalId})` : s.title,
        reviews: reviewsOfOlderVersion(s),
      }))
      .filter((c) => c.reviews > 0);
  }

  /** Undecided duplicate flags, and how many final reviews each held copy keeps out of a run. */
  private async pendingDuplicates(eventId: string): Promise<PendingDuplicateDto[]> {
    const flags = await this.prisma.duplicateFlag.findMany({
      where: { eventId, status: 'PENDING' },
      include: {
        kept: { select: { externalId: true, title: true } },
        superseded: { select: { id: true, externalId: true, title: true, duplicateHold: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const label = (s: { externalId: string | null; title: string }) =>
      s.externalId ? `${s.title} (${s.externalId})` : s.title;
    return Promise.all(
      flags.map(async (f) => ({
        flagId: f.id,
        reason: f.reason,
        kept: label(f.kept),
        held: label(f.superseded),
        heldOutReviews: f.superseded.duplicateHold
          ? await this.prisma.review.count({
              where: {
                status: 'FINAL',
                superseded: false,
                assignment: { submissionId: f.superseded.id },
              },
            })
          : 0,
      })),
    );
  }

  /** Deny first: someone who organises nothing is refused before the run is looked up. */
  private async ownRun(actor: Actor, runId: string) {
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const run = isUuid(runId)
      ? await this.prisma.rankingRun.findUnique({ where: { id: runId } })
      : null;
    if (!run) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such ranking.');
    if (!actor.canManageEvent(run.eventId)) throw forbidden();
    return run;
  }

  /** What a ranking is computed from, in a canonical order: the same data gives the same hash. */
  private async inputsOf(eventId: string): Promise<Inputs> {
    const [criteria, reviews] = await Promise.all([
      this.prisma.criterion.findMany({ where: { eventId }, orderBy: { key: 'asc' } }),
      this.prisma.review.findMany({
        where: {
          status: 'FINAL',
          superseded: false,
          assignment: { submission: { eventId, ...IN_JUDGING } },
        },
        include: {
          assignment: { select: { judgeRoleId: true, submissionId: true } },
          scores: { include: { criterion: { select: { key: true } } } },
        },
      }),
    ]);
    return {
      criteria: criteria.map((c) => ({ key: c.key, weight: c.weight, min: c.min, max: c.max })),
      reviews: reviews
        .map((r) => ({
          judge: r.assignment.judgeRoleId,
          project: r.assignment.submissionId,
          values: Object.fromEntries(
            r.scores
              .map((s) => [s.criterion.key, s.value] as const)
              .sort(([a], [b]) => (a < b ? -1 : 1)),
          ),
        }))
        .sort((a, b) =>
          a.project < b.project ? -1 : a.project > b.project ? 1 : a.judge < b.judge ? -1 : 1,
        ),
    };
  }

  private async rowsOf(runId: string): Promise<RankingRowDto[]> {
    const rows = await this.prisma.rankingRow.findMany({
      where: { runId },
      include: {
        submission: {
          select: {
            externalId: true,
            title: true,
            team: { select: { name: true } },
            track: { select: { name: true } },
          },
        },
      },
      orderBy: { rank: 'asc' },
    });
    const ranked = rows.filter((r) => r.tieGroup > 0);
    const rawRank = new Map(
      [...ranked]
        .sort((a, b) => b.rawMean - a.rawMean || (a.submissionId < b.submissionId ? -1 : 1))
        .map((r, i) => [r.submissionId, i + 1]),
    );
    return rows.map((r) => ({
      projectId: r.submissionId,
      externalId: r.submission.externalId,
      title: r.submission.title,
      teamName: r.submission.team.name,
      track: r.submission.track?.name ?? null,
      rank: r.tieGroup > 0 ? r.rank : null,
      tieGroup: r.tieGroup > 0 ? r.tieGroup : null,
      reviews: r.nReviews,
      rawMean: r.rawMean,
      normalized: r.normalized,
      sd: r.posteriorSd,
      move: r.tieGroup > 0 ? rawRank.get(r.submissionId)! - r.rank : null,
      reason: r.reason,
    }));
  }
}

/** One line on why a project's normalized score differs from its raw mean. */
function reasonFor(
  p: { reviews: number; raw: number; normalized: number },
  reviewers: readonly string[],
  bias: ReadonlyMap<string, number>,
): string {
  const judgeBias =
    reviewers.reduce((s, j) => s + (bias.get(j) ?? 0), 0) / Math.max(reviewers.length, 1);
  const judgeEffect = -judgeBias;
  const shrink = p.normalized - p.raw - judgeEffect;
  const parts: string[] = [];
  if (Math.abs(judgeBias) >= NOTABLE) {
    parts.push(
      `${signed(judgeEffect)}: its judges were on average ${Math.abs(judgeBias).toFixed(2)} ${judgeBias > 0 ? 'more' : 'less'} generous than the rest`,
    );
  }
  if (Math.abs(shrink) >= NOTABLE) {
    parts.push(`${signed(shrink)}: pulled towards the mean (${p.reviews} reviews)`);
  }
  return parts.length
    ? `${parts.join('; ')}.`
    : 'Close to its raw mean: typical judges, consistent reviews.';
}

function summary(
  r: {
    id: string;
    eventId: string;
    createdAt: Date;
    publishedAt: Date | null;
    inputsHash: string;
    outputHash: string;
    params: unknown;
  },
  currentInputs: string,
): RankingSummaryDto {
  return {
    id: r.id,
    eventId: r.eventId,
    createdAt: r.createdAt.toISOString(),
    publishedAt: r.publishedAt?.toISOString() ?? null,
    inputsHash: r.inputsHash,
    outputHash: r.outputHash,
    current: r.inputsHash === currentInputs,
    params: r.params as RankingParamsDto,
  };
}

/** SHA-256 of canonical JSON (object keys sorted at every level). */
function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const round = (x: number) => Math.round(x * 1e6) / 1e6;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`;
