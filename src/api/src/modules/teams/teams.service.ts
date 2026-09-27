import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { assertSubmissionsOpen } from '../../core/deadline.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';
import { generateToken, hashToken } from '../../core/tokens.js';
import { type Event, Prisma } from '../../generated/prisma/client.js';
import type { CreateTeamDto, InviteDto, InvitePreviewDto, TeamDto } from './dto/team.dto.js';

/** How long an invite link works, and how many people can join with it. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_MAX_USES = 4;

const TEAM_INCLUDE = {
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.TeamInclude;

type TeamRow = Prisma.TeamGetPayload<{ include: typeof TEAM_INCLUDE }>;

/**
 * Teams and invite links (T1: "team formation by invite link").
 *
 * Team membership changes follow the submission window: nobody creates or joins a team
 * before the event opens or after it closes. Judges and organisers of an event cannot be on
 * a team in it.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Creates a team; the caller becomes its first member and a participant of the event. */
  async create(actor: Actor, event: Event, dto: CreateTeamDto): Promise<TeamDto> {
    assertMayCompete(actor, event);
    assertSubmissionsOpen(event, this.clock.now());

    const team = await withAlreadyOnTeam(() =>
      this.prisma.$transaction(async (tx) => {
        await assertNotOnTeam(tx, event.id, actor.userId);
        if (await tx.team.findFirst({ where: { eventId: event.id, name: dto.name } })) {
          throw new DomainError(
            HttpStatus.CONFLICT,
            'team_name_taken',
            `A team called "${dto.name}" is already in this event.`,
          );
        }
        const row = await tx.team.create({ data: { eventId: event.id, name: dto.name } });
        await addMember(tx, row.id, event.id, actor.userId);
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'team.created',
          targetType: 'team',
          targetId: row.id,
          after: { name: row.name },
        });
        return tx.team.findUniqueOrThrow({ where: { id: row.id }, include: TEAM_INCLUDE });
      }),
    );
    return toDto(team);
  }

  /**
   * A team and its members: for its members, the event's organisers and admins. Anyone else
   * gets 403 whether or not the team exists, so team ids cannot be probed.
   */
  async get(actor: Actor, teamRef: string): Promise<TeamDto> {
    const team = await this.prisma.team.findFirst({ where: byRef(teamRef), include: TEAM_INCLUDE });
    if (!team) {
      if (actor.isAdmin) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such team.');
      throw forbidden();
    }
    const isMember = team.members.some((m) => m.userId === actor.userId);
    if (!isMember && !actor.canManageEvent(team.eventId)) throw forbidden();
    return toDto(team);
  }

  /** A new invite link for the caller's own team. The token is returned once, never stored. */
  async createInvite(actor: Actor, teamRef: string): Promise<InviteDto> {
    // Deny first: the lookup is "the caller's membership of this team", so a non-member
    // learns nothing about whether the team exists.
    const membership = await this.prisma.teamMember.findFirst({
      where: { userId: actor.userId, team: byRef(teamRef) },
      include: { event: true },
    });
    if (!membership) throw forbidden('Only members of this team can invite people to it.');
    const now = this.clock.now();
    assertSubmissionsOpen(membership.event, now);

    const token = generateToken();
    const invite = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invite.create({
        data: {
          teamId: membership.teamId,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
          maxUses: INVITE_MAX_USES,
        },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: membership.eventId,
        action: 'invite.created',
        targetType: 'team',
        targetId: membership.teamId,
        after: { inviteId: row.id, expiresAt: row.expiresAt, maxUses: row.maxUses },
      });
      return row;
    });
    return {
      token,
      path: `/invites/${token}`,
      expiresAt: invite.expiresAt.toISOString(),
      maxUses: invite.maxUses,
    };
  }

  /** Public: what the link is for, without using it. */
  async preview(token: string): Promise<InvitePreviewDto> {
    const invite = await this.usableInvite(token);
    return {
      teamName: invite.team.name,
      eventName: invite.team.event.name,
      eventSlug: invite.team.event.slug,
      expiresAt: invite.expiresAt.toISOString(),
      usesLeft: invite.maxUses - invite.uses,
    };
  }

  /** Joins the invite's team; the caller becomes a participant of the event. */
  async join(actor: Actor, token: string): Promise<TeamDto> {
    const invite = await this.usableInvite(token);
    const event = invite.team.event;
    assertMayCompete(actor, event);
    assertSubmissionsOpen(event, this.clock.now());

    const team = await withAlreadyOnTeam(() =>
      this.prisma.$transaction(async (tx) => {
        await assertNotOnTeam(tx, event.id, actor.userId);
        // Count the use only if nobody else used it since we read it (two people racing
        // for the last place: one joins, the other is told the link is used up).
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, uses: invite.uses },
          data: { uses: { increment: 1 } },
        });
        if (claimed.count === 0) throw usedUp();
        await addMember(tx, invite.teamId, event.id, actor.userId);
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'team.joined',
          targetType: 'team',
          targetId: invite.teamId,
          after: { inviteId: invite.id, userId: actor.userId },
        });
        return tx.team.findUniqueOrThrow({ where: { id: invite.teamId }, include: TEAM_INCLUDE });
      }),
    );
    return toDto(team);
  }

  /** The invite a token names: 404 if unknown, 410 if expired or used up. */
  private async usableInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { team: { include: { event: true } } },
    });
    if (!invite) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such invite.');
    if (invite.expiresAt <= this.clock.now()) {
      throw new DomainError(HttpStatus.GONE, 'invite_expired', 'This invite link has expired.');
    }
    if (invite.uses >= invite.maxUses) throw usedUp();
    return invite;
  }
}

/** Judges and organisers of an event may not compete in it (conflict of interest). */
function assertMayCompete(actor: Actor, event: Event): void {
  if (actor.hasRole(event.id, 'JUDGE') || actor.hasRole(event.id, 'ORGANIZER')) {
    throw forbidden('Judges and organisers of this event cannot be on a team in it.');
  }
}

async function assertNotOnTeam(tx: Tx, eventId: string, userId: string): Promise<void> {
  if (await tx.teamMember.findUnique({ where: { eventId_userId: { eventId, userId } } })) {
    throw alreadyOnTeam();
  }
}

async function addMember(tx: Tx, teamId: string, eventId: string, userId: string): Promise<void> {
  await tx.teamMember.create({ data: { teamId, eventId, userId } });
  await tx.eventRole.createMany({
    data: [{ userId, eventId, role: 'PARTICIPANT' }],
    skipDuplicates: true,
  });
}

const alreadyOnTeam = (): DomainError =>
  new DomainError(
    HttpStatus.CONFLICT,
    'already_on_team',
    'You are already on a team in this event.',
  );

const usedUp = (): DomainError =>
  new DomainError(HttpStatus.GONE, 'invite_used_up', 'This invite link has been used up.');

/** The database's one-team-per-event rule, if two requests race past the check. */
async function withAlreadyOnTeam<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw alreadyOnTeam();
    }
    throw e;
  }
}

function toDto(t: TeamRow): TeamDto {
  return {
    id: t.id,
    externalId: t.externalId,
    eventId: t.eventId,
    name: t.name,
    members: t.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}
