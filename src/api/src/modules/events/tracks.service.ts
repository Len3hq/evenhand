import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';
import { type Event, Prisma, type Track } from '../../generated/prisma/client.js';
import type { EventTrackDto } from './dto/event.dto.js';
import type { CreateTrackDto, UpdateTrackDto } from './dto/track-prize.dto.js';
import { manageableEvent } from './manageable-event.js';

/** An event's tracks. Organisers of that event and admins only. */
@Injectable()
export class TracksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: Actor, eventRef: string, dto: CreateTrackDto): Promise<EventTrackDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const track = await withNameConflict(dto.name, () =>
      this.prisma.$transaction(async (tx) => {
        await assertNameFree(tx, event.id, dto.name);
        const row = await tx.track.create({ data: { eventId: event.id, name: dto.name } });
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'track.created',
          targetType: 'track',
          targetId: row.id,
          after: row,
        });
        return row;
      }),
    );
    return toDto(track);
  }

  async rename(
    actor: Actor,
    eventRef: string,
    trackRef: string,
    dto: UpdateTrackDto,
  ): Promise<EventTrackDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const track = await this.find(event, trackRef);
    if (track.name === dto.name) return toDto(track);

    const renamed = await withNameConflict(dto.name, () =>
      this.prisma.$transaction(async (tx) => {
        await assertNameFree(tx, event.id, dto.name);
        const row = await tx.track.update({ where: { id: track.id }, data: { name: dto.name } });
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'track.updated',
          targetType: 'track',
          targetId: track.id,
          before: { name: track.name },
          after: { name: row.name },
        });
        return row;
      }),
    );
    return toDto(renamed);
  }

  /**
   * Removes an unused track. A track with submissions, prizes or judges is refused with 409:
   * deleting it would silently move projects out of it, turn its prizes into overall prizes
   * and change what its judges may see. Move those first.
   */
  async remove(actor: Actor, eventRef: string, trackRef: string): Promise<void> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const track = await this.find(event, trackRef);

    await this.prisma.$transaction(async (tx) => {
      const [submissions, prizes, judges] = await Promise.all([
        tx.submission.count({ where: { trackId: track.id } }),
        tx.prize.count({ where: { trackId: track.id } }),
        tx.judgeTrack.count({ where: { trackId: track.id } }),
      ]);
      const uses = [
        submissions && `${submissions} submission${submissions === 1 ? '' : 's'}`,
        prizes && `${prizes} prize${prizes === 1 ? '' : 's'}`,
        judges && `${judges} judge${judges === 1 ? '' : 's'}`,
      ].filter(Boolean);
      if (uses.length) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'track_in_use',
          `"${track.name}" still has ${uses.join(', ')}. Move them to another track first.`,
        );
      }
      await tx.track.delete({ where: { id: track.id } });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'track.deleted',
        targetType: 'track',
        targetId: track.id,
        before: track,
      });
    });
  }

  /** A track of this event, by id or fixture id (e.g. trk_01). */
  private async find(event: Event, ref: string): Promise<Track> {
    const track = await this.prisma.track.findFirst({
      where: { eventId: event.id, ...byRef(ref) },
    });
    if (!track) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such track.');
    return track;
  }
}

async function assertNameFree(
  tx: Prisma.TransactionClient,
  eventId: string,
  name: string,
): Promise<void> {
  if (await tx.track.findUnique({ where: { eventId_name: { eventId, name } } })) {
    throw nameTaken(name);
  }
}

const nameTaken = (name: string): DomainError =>
  new DomainError(HttpStatus.CONFLICT, 'track_name_taken', `A track called "${name}" exists.`);

/** Two writes racing for the same name: the loser gets 409, not a 500. */
async function withNameConflict<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw nameTaken(name);
    }
    throw e;
  }
}

const toDto = (t: Track): EventTrackDto => ({ id: t.id, externalId: t.externalId, name: t.name });
