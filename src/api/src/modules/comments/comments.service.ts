import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef, isUuid } from '../../core/refs.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PUBLIC_SUBMISSION } from '../gallery/gallery.service.js';
import type { CommentDto } from './dto/comment.dto.js';

const COMMENT_INCLUDE = {
  author: { select: { name: true } },
} satisfies Prisma.CommentInclude;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

/** An excerpt for the audit trail: enough to recognise a comment, never the whole text. */
const excerpt = (body: string): string => (body.length > 80 ? `${body.slice(0, 79)}…` : body);

/**
 * Comments on public projects (T3). Anyone logged in may post on a project that is in the public
 * gallery; comments are plain text, rate limited per address, and every post is audited. The
 * event's organisers moderate by hiding a comment with a reason, which is reversible: nothing is
 * deleted. Visitors never receive hidden comments; organisers see them marked, with the reason.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** A public project's comments, oldest first. 404 for a project that is not public. */
  async list(actor: Actor | undefined, projectRef: string): Promise<CommentDto[]> {
    const project = await this.publicProject(projectRef);
    const moderator = actor ? actor.canManageEvent(project.eventId) : false;
    const rows = await this.prisma.comment.findMany({
      where: { submissionId: project.id, ...(moderator ? {} : { hiddenAt: null }) },
      include: COMMENT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => toDto(r, moderator));
  }

  async post(actor: Actor, projectRef: string, rawBody: string): Promise<CommentDto> {
    const body = rawBody.trim();
    if (!body) {
      throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', 'Write something first.');
    }
    const project = await this.publicProject(projectRef);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.comment.create({
        data: { submissionId: project.id, authorId: actor.userId, body },
        include: COMMENT_INCLUDE,
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: project.eventId,
        action: 'comment.posted',
        targetType: 'submission',
        targetId: project.id,
        after: { comment: row.id, excerpt: excerpt(body) },
      });
      return toDto(row, actor.canManageEvent(project.eventId));
    });
  }

  async hide(actor: Actor, commentId: string, rawReason: string): Promise<CommentDto> {
    const comment = await this.moderated(actor, commentId);
    const reason = rawReason.trim();
    if (reason.length < 3) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Give a reason (at least 3 characters).',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // Conditional update: two organisers cannot both hide it.
      const changed = await tx.comment.updateMany({
        where: { id: comment.id, hiddenAt: null },
        data: { hiddenAt: this.clock.now(), hiddenById: actor.userId, hideReason: reason },
      });
      if (changed.count !== 1) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'comment_already_hidden',
          'This comment is already hidden.',
        );
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: comment.submission.eventId,
        action: 'comment.hidden',
        targetType: 'submission',
        targetId: comment.submissionId,
        before: { hidden: false },
        after: { comment: comment.id, reason, excerpt: excerpt(comment.body) },
      });
      return toDto(
        await tx.comment.findUniqueOrThrow({ where: { id: comment.id }, include: COMMENT_INCLUDE }),
        true,
      );
    });
  }

  async restore(actor: Actor, commentId: string): Promise<CommentDto> {
    const comment = await this.moderated(actor, commentId);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.comment.updateMany({
        where: { id: comment.id, hiddenAt: { not: null } },
        data: { hiddenAt: null, hiddenById: null, hideReason: null },
      });
      if (changed.count !== 1) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'comment_not_hidden',
          'This comment is not hidden.',
        );
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: comment.submission.eventId,
        action: 'comment.restored',
        targetType: 'submission',
        targetId: comment.submissionId,
        before: { hidden: true, reason: comment.hideReason },
        after: { comment: comment.id, hidden: false },
      });
      return toDto(
        await tx.comment.findUniqueOrThrow({ where: { id: comment.id }, include: COMMENT_INCLUDE }),
        true,
      );
    });
  }

  /** The project named by `ref` if it is in the public gallery; otherwise 404, as the gallery. */
  private async publicProject(ref: string) {
    const project = await this.prisma.submission.findFirst({
      where: { ...PUBLIC_SUBMISSION, ...byRef(ref) },
      select: { id: true, eventId: true },
    });
    if (!project) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such project.');
    return project;
  }

  /**
   * Deny first: someone who organises nothing is refused before the comment is looked up; an
   * organiser of another event is refused after it.
   */
  private async moderated(actor: Actor, commentId: string) {
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const comment = isUuid(commentId)
      ? await this.prisma.comment.findUnique({
          where: { id: commentId },
          include: { submission: { select: { eventId: true } } },
        })
      : null;
    if (!comment) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such comment.');
    if (!actor.canManageEvent(comment.submission.eventId)) throw forbidden();
    return comment;
  }
}

function toDto(r: CommentRow, moderator: boolean): CommentDto {
  return {
    id: r.id,
    author: { name: r.author.name },
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    hidden: r.hiddenAt !== null,
    hideReason: moderator ? r.hideReason : null,
  };
}
