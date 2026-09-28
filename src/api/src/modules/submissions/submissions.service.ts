import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { assertSubmissionsOpen } from '../../core/deadline.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';
import type { Event, Submission } from '../../generated/prisma/client.js';
import type {
  CreateSubmissionDto,
  SubmissionDto,
  UpdateSubmissionDto,
} from './dto/submission.dto.js';

/** Fields a team edits, in the order the audit log lists them. */
const EDITABLE = [
  'title',
  'tagline',
  'summary',
  'description',
  'repoUrl',
  'demoVideoUrl',
  'liveUrl',
  'techTags',
  'trackId',
] as const;
type Editable = (typeof EDITABLE)[number];

/** What a draft needs before it can be submitted (the gallery card shows both). */
const REQUIRED_TO_SUBMIT = ['title', 'summary'] as const;

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /**
   * Creates the team's draft submission. Order of checks (CONTRIBUTING.md §3.2):
   * permission → deadline → write + audit in one transaction → DTO.
   * One live submission per team per event: a second attempt gets 409; teams edit their draft.
   */
  async create(actor: Actor, event: Event, dto: CreateSubmissionDto): Promise<SubmissionDto> {
    // 1. permission: the caller must be on a team in this event.
    const membership = await this.prisma.teamMember.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: actor.userId } },
    });
    if (!membership) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'not_a_team_member',
        'Join or create a team first.',
      );
    }
    // 2. deadline (already enforced by SubmissionsOpenGuard; repeated here as defence in depth).
    assertSubmissionsOpen(event, this.clock.now());

    const trackId = dto.track ? await this.trackIdIn(event.id, dto.track) : null;

    // 3. write + audit together.
    const created = await this.prisma.$transaction(async (tx) => {
      const live = await tx.submission.findFirst({
        where: {
          eventId: event.id,
          teamId: membership.teamId,
          supersededById: null,
          duplicateHold: false,
        },
        select: { id: true },
      });
      if (live) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'team_already_has_submission',
          'Your team already has a submission for this event; edit it instead.',
        );
      }
      const row = await tx.submission.create({
        data: {
          eventId: event.id,
          teamId: membership.teamId,
          trackId,
          title: dto.title,
          tagline: dto.tagline ?? null,
          summary: dto.summary ?? null,
          description: dto.description ?? null,
          repoUrl: dto.repoUrl ?? null,
          demoVideoUrl: dto.demoVideoUrl ?? null,
          liveUrl: dto.liveUrl ?? null,
          techTags: dto.techTags ?? [],
        },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'submission.created',
        targetType: 'submission',
        targetId: row.id,
        after: row,
      });
      return row;
    });

    // 4. DTO out, never the raw row.
    return toDto(created);
  }

  /**
   * A submission, draft or not: for its team's members, the event's organisers and admins.
   * Anyone else gets 403 whether or not it exists, so drafts cannot be probed. (Submitted,
   * eligible entries are public through the gallery.)
   */
  async get(actor: Actor, ref: string): Promise<SubmissionDto> {
    const own = await this.ownSubmission(actor, ref);
    if (own) return toDto(own.submission);

    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const submission = await this.prisma.submission.findFirst({ where: byRef(ref) });
    if (!submission) {
      if (actor.isAdmin) throw notFound();
      throw forbidden();
    }
    if (!actor.canManageEvent(submission.eventId)) throw forbidden();
    return toDto(submission);
  }

  /** Edits the team's submission. Members only, until the deadline (also after submitting). */
  async update(actor: Actor, ref: string, dto: UpdateSubmissionDto): Promise<SubmissionDto> {
    // 1. permission, 2. deadline.
    const { submission, event } = await this.editable(actor, ref);
    if (dto.title === null) {
      throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', 'title cannot be removed');
    }

    const data: Pick<Submission, Editable> = {
      title: dto.title ?? submission.title,
      tagline: pickField(dto.tagline, submission.tagline),
      summary: pickField(dto.summary, submission.summary),
      description: pickField(dto.description, submission.description),
      repoUrl: pickField(dto.repoUrl, submission.repoUrl),
      demoVideoUrl: pickField(dto.demoVideoUrl, submission.demoVideoUrl),
      liveUrl: pickField(dto.liveUrl, submission.liveUrl),
      techTags: dto.techTags ?? submission.techTags,
      trackId:
        dto.track === undefined
          ? submission.trackId
          : dto.track === null
            ? null
            : await this.trackIdIn(event.id, dto.track),
    };
    const changed = EDITABLE.filter((k) => !same(submission[k], data[k]));
    if (!changed.length) return toDto(submission);

    // 3. write + audit together; only the fields that changed are recorded.
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.submission.update({ where: { id: submission.id }, data });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'submission.updated',
        targetType: 'submission',
        targetId: submission.id,
        before: pick(submission, changed),
        after: pick(row, changed),
      });
      return row;
    });
    return toDto(updated);
  }

  /**
   * Marks the draft as submitted, which puts it in the public gallery. Needs a title and a
   * summary. Submitting again is a no-op: the entry stays submitted and keeps its first
   * submission time; the team can still edit it until the deadline.
   */
  async submit(actor: Actor, ref: string): Promise<SubmissionDto> {
    const { submission, event } = await this.editable(actor, ref);
    if (submission.status === 'SUBMITTED') return toDto(submission);

    const missing = REQUIRED_TO_SUBMIT.filter((k) => !submission[k]?.trim());
    if (missing.length) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        `Add ${missing.join(' and ')} before submitting.`,
      );
    }

    const submitted = await this.prisma.$transaction(async (tx) => {
      const row = await tx.submission.update({
        where: { id: submission.id },
        data: { status: 'SUBMITTED', submittedAt: this.clock.now() },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'submission.submitted',
        targetType: 'submission',
        targetId: submission.id,
        before: { status: submission.status },
        after: { status: row.status, submittedAt: row.submittedAt },
      });
      return row;
    });
    return toDto(submitted);
  }

  /**
   * The submission if the caller is on its team, else null. One query that asks "is this
   * mine?", so a non-member learns nothing about whether the submission exists.
   */
  private async ownSubmission(actor: Actor, ref: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { ...byRef(ref), team: { members: { some: { userId: actor.userId } } } },
      include: { event: true },
    });
    return submission ? { submission, event: submission.event } : null;
  }

  /** Permission (a team member) then deadline, for every write after create. */
  private async editable(actor: Actor, ref: string) {
    const own = await this.ownSubmission(actor, ref);
    if (!own) throw forbidden('Only members of the team can change its submission.');
    assertSubmissionsOpen(own.event, this.clock.now());
    if (own.submission.supersededById || own.submission.duplicateHold) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'submission_superseded',
        "This copy was replaced by the team's newer submission; edit that one.",
      );
    }
    return own;
  }

  /** A track of this event, by id or fixture id; 400 for anything else. */
  private async trackIdIn(eventId: string, ref: string): Promise<string> {
    const track = await this.prisma.track.findFirst({
      where: { eventId, ...byRef(ref) },
      select: { id: true },
    });
    if (!track) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Unknown track for this event.',
      );
    }
    return track.id;
  }
}

const notFound = (): DomainError =>
  new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such submission.');

/** `undefined` keeps the stored value; `null` clears it. */
const pickField = (value: string | null | undefined, stored: string | null): string | null =>
  value === undefined ? stored : value;

const same = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

const pick = (row: Submission, keys: readonly Editable[]): Partial<Submission> =>
  Object.fromEntries(keys.map((k) => [k, row[k]]));

function toDto(s: Submission): SubmissionDto {
  return {
    id: s.id,
    externalId: s.externalId,
    eventId: s.eventId,
    teamId: s.teamId,
    trackId: s.trackId,
    title: s.title,
    tagline: s.tagline,
    summary: s.summary,
    description: s.description,
    repoUrl: s.repoUrl,
    demoVideoUrl: s.demoVideoUrl,
    liveUrl: s.liveUrl,
    techTags: s.techTags,
    status: s.status,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    eligibility: s.eligibility,
    disqualifyReason: s.disqualifyReason,
    supersededById: s.supersededById,
    duplicateHold: s.duplicateHold,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
