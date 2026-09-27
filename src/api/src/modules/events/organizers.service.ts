import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { isUuid } from '../../core/refs.js';
import type { AddOrganizerDto, OrganizerDto } from './dto/organizer.dto.js';
import { manageableEvent } from './manageable-event.js';

const WITH_USER = { user: { select: { id: true, name: true, email: true } } } as const;

/**
 * Who organises an event. Its organisers and admins manage the list. An event always keeps at
 * least one organiser, and nobody who competes in or judges an event can organise it:
 * organisers see every score.
 */
@Injectable()
export class OrganizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: Actor, eventRef: string): Promise<OrganizerDto[]> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const roles = await this.prisma.eventRole.findMany({
      where: { eventId: event.id, role: 'ORGANIZER' },
      include: WITH_USER,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return roles.map(toDto);
  }

  async add(actor: Actor, eventRef: string, dto: AddOrganizerDto): Promise<OrganizerDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'not_found',
        `No account uses ${dto.email}. Ask them to register first.`,
      );
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const roles = await tx.eventRole.findMany({
        where: { eventId: event.id, userId: user.id },
        select: { role: true },
      });
      if (roles.some((r) => r.role === 'ORGANIZER')) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'already_organizer',
          `${user.name} already organises this event.`,
        );
      }
      const onTeam = await tx.teamMember.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
      });
      if (onTeam || roles.some((r) => r.role === 'JUDGE')) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'conflict_of_interest',
          `${user.name} ${onTeam ? 'is on a team' : 'judges'} in this event, so cannot organise it.`,
        );
      }
      const created = await tx.eventRole.create({
        data: { userId: user.id, eventId: event.id, role: 'ORGANIZER' },
        include: WITH_USER,
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'organizer.added',
        targetType: 'user',
        targetId: user.id,
        after: { email: user.email, role: 'ORGANIZER' },
      });
      return created;
    });
    return toDto(role);
  }

  /** Removes an organiser (yourself included), unless they are the last one. */
  async remove(actor: Actor, eventRef: string, userId: string): Promise<void> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    await this.prisma.$transaction(async (tx) => {
      const role = isUuid(userId)
        ? await tx.eventRole.findUnique({
            where: { userId_eventId_role: { userId, eventId: event.id, role: 'ORGANIZER' } },
            include: WITH_USER,
          })
        : null;
      if (!role) {
        throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'Not an organiser of this event.');
      }
      const count = await tx.eventRole.count({ where: { eventId: event.id, role: 'ORGANIZER' } });
      if (count <= 1) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'last_organizer',
          'An event needs at least one organiser. Add another before removing this one.',
        );
      }
      await tx.eventRole.delete({ where: { id: role.id } });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'organizer.removed',
        targetType: 'user',
        targetId: role.userId,
        before: { email: role.user.email, role: 'ORGANIZER' },
      });
    });
  }
}

function toDto(r: {
  createdAt: Date;
  user: { id: string; name: string; email: string };
}): OrganizerDto {
  return {
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
    since: r.createdAt.toISOString(),
  };
}
