import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { submissionsOpen } from '../../core/deadline.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { type Page, pageArgs } from '../../core/pagination.js';
import { PrismaService } from '../../core/prisma.service.js';
import { eventByRef } from '../../core/refs.js';
import { type Event, Prisma } from '../../generated/prisma/client.js';
import type {
  CreateEventDto,
  EventDetailDto,
  EventDto,
  EventQueryDto,
  UpdateEventDto,
} from './dto/event.dto.js';
import { manageableEvent } from './manageable-event.js';
import { firstFreeSlug, isReservedSlug, slugify } from './slug.js';

/** The fields an organiser can edit, as stored. */
type EventDates = Pick<Event, 'opensAt' | 'submissionsClose' | 'judgingClose'>;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Public: every event, newest deadline first. */
  async list(query: EventQueryDto): Promise<Page<EventDto>> {
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        orderBy: [{ submissionsClose: 'desc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.event.count(),
    ]);
    const now = this.clock.now();
    return {
      items: rows.map((e) => toDto(e, now)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Public: one event with its tracks and prizes, by id, fixture id or slug. */
  async get(ref: string): Promise<EventDetailDto> {
    const event = await this.prisma.event.findFirst({
      where: eventByRef(ref),
      include: {
        tracks: { orderBy: [{ externalId: 'asc' }, { name: 'asc' }] },
        prizes: { orderBy: [{ trackId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }] },
      },
    });
    if (!event) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such event.');
    return {
      ...toDto(event, this.clock.now()),
      tracks: event.tracks.map((t) => ({ id: t.id, externalId: t.externalId, name: t.name })),
      prizes: event.prizes.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        trackId: p.trackId,
      })),
    };
  }

  /**
   * Creates an event; the creator becomes its organiser. Allowed for platform admins and for
   * anyone who already organises an event (docs/decisions/20260927-0811-a-who-creates-events.md).
   */
  async create(actor: Actor, dto: CreateEventDto): Promise<EventDto> {
    // 1. permission, before anything is read.
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) {
      throw forbidden('Only admins and organisers can create events.');
    }
    // 2. the event's own rules: dates in order, a usable slug.
    const dates = checkDates({
      opensAt: dto.opensAt ? new Date(dto.opensAt) : null,
      submissionsClose: new Date(dto.submissionsClose),
      judgingClose: dto.judgingClose ? new Date(dto.judgingClose) : null,
    });
    if (dto.slug && isReservedSlug(dto.slug)) {
      throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', 'slug is reserved');
    }

    // 3. write + audit together.
    const created = await withSlugConflict(() =>
      this.prisma.$transaction(async (tx) => {
        const slug = dto.slug ?? (await freeSlugFor(tx, slugify(dto.name)));
        if (dto.slug && (await tx.event.findUnique({ where: { slug }, select: { id: true } }))) {
          throw slugTaken(slug);
        }
        const event = await tx.event.create({ data: { name: dto.name, slug, ...dates } });
        await tx.eventRole.create({
          data: { userId: actor.userId, eventId: event.id, role: 'ORGANIZER' },
        });
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'event.created',
          targetType: 'event',
          targetId: event.id,
          after: event,
        });
        return event;
      }),
    );

    // 4. DTO out.
    return toDto(created, this.clock.now());
  }

  /** Edits the name or dates. Organisers of this event and admins only. */
  async update(actor: Actor, ref: string, dto: UpdateEventDto): Promise<EventDto> {
    // 1. deny first: someone who organises nothing is refused without a lookup.
    const event = await manageableEvent(this.prisma, actor, ref);

    // 2. the merged result must still be a valid event.
    if (dto.submissionsClose === null) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'submissionsClose cannot be removed',
      );
    }
    const dates = checkDates({
      opensAt: dto.opensAt === undefined ? event.opensAt : toDate(dto.opensAt),
      submissionsClose: dto.submissionsClose
        ? new Date(dto.submissionsClose)
        : event.submissionsClose,
      judgingClose: dto.judgingClose === undefined ? event.judgingClose : toDate(dto.judgingClose),
    });
    const data = { name: dto.name ?? event.name, ...dates };
    const changed = EDITABLE.filter((k) => !same(event[k], data[k]));

    // 3. write + audit together; an edit that changes nothing writes nothing.
    const updated = changed.length
      ? await this.prisma.$transaction(async (tx) => {
          const row = await tx.event.update({ where: { id: event.id }, data });
          await this.audit.record(tx, {
            actorId: actor.userId,
            eventId: event.id,
            action: 'event.updated',
            targetType: 'event',
            targetId: event.id,
            before: pick(event, changed),
            after: pick(row, changed),
          });
          return row;
        })
      : event;

    return toDto(updated, this.clock.now());
  }
}

/** opens_at < submissions_close < judging_close, where set. */
function checkDates<T extends EventDates>(d: T): T {
  const problem =
    (d.opensAt && d.opensAt >= d.submissionsClose && 'opensAt must be before submissionsClose') ||
    (d.judgingClose &&
      d.judgingClose <= d.submissionsClose &&
      'judgingClose must be after submissionsClose');
  if (problem) throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', problem);
  return d;
}

async function freeSlugFor(tx: Prisma.TransactionClient, base: string): Promise<string> {
  const rows = await tx.event.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return firstFreeSlug(base, new Set(rows.map((r) => r.slug)));
}

const slugTaken = (slug: string): DomainError =>
  new DomainError(HttpStatus.CONFLICT, 'slug_taken', `The slug "${slug}" is already in use.`);

/** Two creates racing for the same slug: the loser gets 409, not a 500. */
async function withSlugConflict<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError(HttpStatus.CONFLICT, 'slug_taken', 'That slug is already in use.');
    }
    throw e;
  }
}

const EDITABLE = ['name', 'opensAt', 'submissionsClose', 'judgingClose'] as const;

const toDate = (v: string | null): Date | null => (v === null ? null : new Date(v));

const same = (a: string | Date | null, b: string | Date | null): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

/** The listed fields of a row, for the audit log's before/after. */
const pick = (row: Event, keys: readonly (typeof EDITABLE)[number][]): Partial<Event> =>
  Object.fromEntries(keys.map((k) => [k, row[k]]));

function toDto(e: Event, now: Date): EventDto {
  return {
    id: e.id,
    externalId: e.externalId,
    slug: e.slug,
    name: e.name,
    opensAt: e.opensAt?.toISOString() ?? null,
    submissionsClose: e.submissionsClose.toISOString(),
    judgingClose: e.judgingClose?.toISOString() ?? null,
    resultsPublishedAt: e.resultsPublishedAt?.toISOString() ?? null,
    submissionsOpen: submissionsOpen(e, now),
  };
}
