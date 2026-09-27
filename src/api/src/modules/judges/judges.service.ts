import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';
import { generateToken, hashToken } from '../../core/tokens.js';
import type { Event, Track } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import type {
  CreateJudgeInviteDto,
  JoinedAsJudgeDto,
  JudgeDto,
  JudgeInviteDto,
  JudgeInvitePreviewDto,
  JudgeTracksDto,
} from './dto/judges.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Judges of an event (T2: "judge invitation"). Organisers invite by link (nothing is emailed)
 * and choose the tracks a judge covers; a judge sees and scores only those tracks. Nobody who
 * competes in or organises an event can judge it.
 */
@Injectable()
export class JudgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async createInvite(
    actor: Actor,
    eventRef: string,
    dto: CreateJudgeInviteDto,
  ): Promise<JudgeInviteDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    this.assertJudgingOpen(event);
    const tracks = await this.tracksOf(event, dto.tracks);
    const token = generateToken();
    const now = this.clock.now();

    const invite = await this.prisma.$transaction(async (tx) => {
      const row = await tx.judgeInvite.create({
        data: {
          eventId: event.id,
          tokenHash: hashToken(token),
          trackIds: tracks.map((t) => t.id),
          expiresAt: new Date(now.getTime() + (dto.days ?? 7) * DAY_MS),
          maxUses: dto.maxUses ?? 1,
          createdById: actor.userId,
        },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'judge.invited',
        targetType: 'event',
        targetId: event.id,
        after: { inviteId: row.id, tracks: tracks.map((t) => t.name), maxUses: row.maxUses },
      });
      return row;
    });
    return {
      token,
      path: `/judge-invites/${token}`,
      expiresAt: invite.expiresAt.toISOString(),
      maxUses: invite.maxUses,
      tracks: tracks.map(trackDto),
    };
  }

  async preview(token: string): Promise<JudgeInvitePreviewDto> {
    const invite = await this.usableInvite(token);
    const tracks = await this.prisma.track.findMany({
      where: { id: { in: invite.trackIds }, eventId: invite.eventId },
      orderBy: [{ externalId: 'asc' }, { name: 'asc' }],
    });
    return {
      eventName: invite.event.name,
      eventSlug: invite.event.slug,
      tracks: tracks.map((t) => t.name),
      expiresAt: invite.expiresAt.toISOString(),
      usesLeft: invite.maxUses - invite.uses,
    };
  }

  async accept(actor: Actor, token: string): Promise<JoinedAsJudgeDto> {
    const invite = await this.usableInvite(token);
    const event = invite.event;
    this.assertJudgingOpen(event);
    if (actor.hasRole(event.id, 'JUDGE')) {
      throw new DomainError(HttpStatus.CONFLICT, 'already_judge', 'You already judge this event.');
    }
    if (actor.hasRole(event.id, 'ORGANIZER')) {
      throw conflict('You organise this event, so you cannot judge it.');
    }

    const role = await this.prisma.$transaction(async (tx) => {
      if (
        await tx.teamMember.findUnique({
          where: { eventId_userId: { eventId: event.id, userId: actor.userId } },
        })
      ) {
        throw conflict('You are on a team in this event, so you cannot judge it.');
      }
      const claimed = await tx.judgeInvite.updateMany({
        where: { id: invite.id, uses: invite.uses },
        data: { uses: { increment: 1 } },
      });
      if (claimed.count === 0) throw usedUp();
      const tracks = await tx.track.findMany({
        where: { id: { in: invite.trackIds }, eventId: event.id },
      });
      const created = await tx.eventRole.create({
        data: { userId: actor.userId, eventId: event.id, role: 'JUDGE' },
      });
      await tx.judgeTrack.createMany({
        data: tracks.map((t) => ({ judgeRoleId: created.id, trackId: t.id })),
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'judge.joined',
        targetType: 'user',
        targetId: actor.userId,
        after: { inviteId: invite.id, tracks: tracks.map((t) => t.name) },
      });
      return created;
    });
    return { eventId: event.id, eventSlug: event.slug, judgeId: role.id };
  }

  async list(actor: Actor, eventRef: string): Promise<JudgeDto[]> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const judges = await this.prisma.eventRole.findMany({
      where: { eventId: event.id, role: 'JUDGE' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        judgeTracks: { include: { track: true } },
        assignments: { select: { review: { select: { status: true } } } },
      },
      orderBy: [{ externalId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return judges.map((j) => ({
      judgeId: j.id,
      externalId: j.externalId,
      userId: j.user.id,
      name: j.user.name,
      email: j.user.email,
      tracks: j.judgeTracks.map((jt) => trackDto(jt.track)).sort(byName),
      assigned: j.assignments.length,
      finished: j.assignments.filter((a) => a.review?.status === 'FINAL').length,
      since: j.createdAt.toISOString(),
    }));
  }

  async setTracks(
    actor: Actor,
    eventRef: string,
    judgeRef: string,
    dto: JudgeTracksDto,
  ): Promise<JudgeDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const judge = await this.judgeOf(event, judgeRef);
    const tracks = await this.tracksOf(event, dto.tracks);
    const before = judge.judgeTracks.map((jt) => jt.track.name).sort();
    const after = tracks.map((t) => t.name).sort();

    if (before.join('\n') !== after.join('\n')) {
      await this.prisma.$transaction(async (tx) => {
        await tx.judgeTrack.deleteMany({ where: { judgeRoleId: judge.id } });
        await tx.judgeTrack.createMany({
          data: tracks.map((t) => ({ judgeRoleId: judge.id, trackId: t.id })),
        });
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'judge.tracks_updated',
          targetType: 'user',
          targetId: judge.userId,
          before: { tracks: before },
          after: { tracks: after },
        });
      });
    }
    const [updated] = (await this.list(actor, event.id)).filter((j) => j.judgeId === judge.id);
    return updated!;
  }

  /** Removes a judge who has not reviewed anything yet (their unstarted assignments go too). */
  async remove(actor: Actor, eventRef: string, judgeRef: string): Promise<void> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const judge = await this.judgeOf(event, judgeRef);
    await this.prisma.$transaction(async (tx) => {
      const reviews = await tx.review.count({ where: { assignment: { judgeRoleId: judge.id } } });
      if (reviews > 0) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'judge_has_reviews',
          `${judge.user.name} has already reviewed ${reviews} project${reviews === 1 ? '' : 's'}; a judge with reviews stays on the record.`,
        );
      }
      await tx.eventRole.delete({ where: { id: judge.id } });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'judge.removed',
        targetType: 'user',
        targetId: judge.userId,
        before: { email: judge.user.email, tracks: judge.judgeTracks.map((jt) => jt.track.name) },
      });
    });
  }

  /** The invite a token names: 404 if unknown, 410 if expired or used up. */
  private async usableInvite(token: string) {
    const invite = await this.prisma.judgeInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { event: true },
    });
    if (!invite) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such invite.');
    if (invite.expiresAt <= this.clock.now()) {
      throw new DomainError(HttpStatus.GONE, 'invite_expired', 'This invite link has expired.');
    }
    if (invite.uses >= invite.maxUses) throw usedUp();
    return invite;
  }

  /** Judges can be invited and join until judging closes (if the event sets a close). */
  private assertJudgingOpen(event: Event): void {
    if (event.judgingClose && event.judgingClose <= this.clock.now()) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'judging_closed',
        `Judging closed at ${event.judgingClose.toISOString()}.`,
      );
    }
  }

  /** Tracks of this event by id or fixture id; required when the event has any. */
  private async tracksOf(event: Event, refs: string[]): Promise<Track[]> {
    const all = await this.prisma.track.findMany({ where: { eventId: event.id } });
    const found = [...new Set(refs)].map((ref) =>
      all.find((t) => t.id === ref || t.externalId === ref),
    );
    if (found.some((t) => !t)) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Unknown track for this event.',
      );
    }
    if (all.length > 0 && found.length === 0) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Choose at least one track.',
      );
    }
    return (found as Track[]).sort(byName);
  }

  private async judgeOf(event: Event, ref: string) {
    const judge = await this.prisma.eventRole.findFirst({
      where: { eventId: event.id, role: 'JUDGE', ...byRef(ref) },
      include: { user: true, judgeTracks: { include: { track: true } } },
    });
    if (!judge)
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such judge in this event.');
    return judge;
  }
}

const trackDto = (t: Track) => ({ id: t.id, externalId: t.externalId, name: t.name });
const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
const conflict = (message: string) =>
  new DomainError(HttpStatus.CONFLICT, 'conflict_of_interest', message);
const usedUp = () =>
  new DomainError(HttpStatus.GONE, 'invite_used_up', 'This invite link has been used up.');
