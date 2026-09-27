import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef, isUuid } from '../../core/refs.js';
import type { Event, Prize } from '../../generated/prisma/client.js';
import type { EventPrizeDto } from './dto/event.dto.js';
import type { CreatePrizeDto, UpdatePrizeDto } from './dto/track-prize.dto.js';
import { manageableEvent } from './manageable-event.js';

const EDITABLE = ['name', 'description', 'trackId'] as const;

/** An event's prizes, overall or per track. Organisers of that event and admins only. */
@Injectable()
export class PrizesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: Actor, eventRef: string, dto: CreatePrizeDto): Promise<EventPrizeDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const trackId = dto.track ? await this.trackIdIn(event, dto.track) : null;

    const prize = await this.prisma.$transaction(async (tx) => {
      const row = await tx.prize.create({
        data: { eventId: event.id, name: dto.name, description: dto.description ?? null, trackId },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'prize.created',
        targetType: 'prize',
        targetId: row.id,
        after: row,
      });
      return row;
    });
    return toDto(prize);
  }

  async update(
    actor: Actor,
    eventRef: string,
    prizeId: string,
    dto: UpdatePrizeDto,
  ): Promise<EventPrizeDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const prize = await this.find(event, prizeId);
    if (dto.name === null) {
      throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', 'name cannot be removed');
    }

    const data = {
      name: dto.name ?? prize.name,
      description: dto.description === undefined ? prize.description : dto.description,
      trackId:
        dto.track === undefined
          ? prize.trackId
          : dto.track === null
            ? null
            : await this.trackIdIn(event, dto.track),
    };
    const changed = EDITABLE.filter((k) => prize[k] !== data[k]);
    if (!changed.length) return toDto(prize);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.prize.update({ where: { id: prize.id }, data });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'prize.updated',
        targetType: 'prize',
        targetId: prize.id,
        before: pick(prize, changed),
        after: pick(row, changed),
      });
      return row;
    });
    return toDto(updated);
  }

  async remove(actor: Actor, eventRef: string, prizeId: string): Promise<void> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const prize = await this.find(event, prizeId);
    await this.prisma.$transaction(async (tx) => {
      await tx.prize.delete({ where: { id: prize.id } });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'prize.deleted',
        targetType: 'prize',
        targetId: prize.id,
        before: prize,
      });
    });
  }

  /** A prize of this event. Prizes have no fixture id, so only the internal id works. */
  private async find(event: Event, id: string): Promise<Prize> {
    const prize = isUuid(id)
      ? await this.prisma.prize.findFirst({ where: { id, eventId: event.id } })
      : null;
    if (!prize) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such prize.');
    return prize;
  }

  /** A prize can only be for a track of its own event. */
  private async trackIdIn(event: Event, ref: string): Promise<string> {
    const track = await this.prisma.track.findFirst({
      where: { eventId: event.id, ...byRef(ref) },
      select: { id: true },
    });
    if (!track) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'track is not a track of this event',
      );
    }
    return track.id;
  }
}

const pick = (row: Prize, keys: readonly (typeof EDITABLE)[number][]): Partial<Prize> =>
  Object.fromEntries(keys.map((k) => [k, row[k]]));

const toDto = (p: Prize): EventPrizeDto => ({
  id: p.id,
  name: p.name,
  description: p.description,
  trackId: p.trackId,
});
