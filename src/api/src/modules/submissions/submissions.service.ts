import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { assertSubmissionsOpen } from '../../core/deadline.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';
import type { Event } from '../../generated/prisma/client.js';
import type { CreateSubmissionDto, SubmissionDto } from './dto/submission.dto.js';

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

    const track = dto.track
      ? await this.prisma.track.findFirst({ where: { eventId: event.id, ...byRef(dto.track) } })
      : null;
    if (dto.track && !track) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Unknown track for this event.',
      );
    }

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
          trackId: track?.id ?? null,
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
    return {
      id: created.id,
      eventId: created.eventId,
      teamId: created.teamId,
      title: created.title,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    };
  }
}
