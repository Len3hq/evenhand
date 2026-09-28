import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';
import { manageableEvent } from '../events/manageable-event.js';
import type { DisqualifyDto, EntryDto } from './dto/integrity.dto.js';
import { ENTRY_INCLUDE, label, toEntry } from './entries.js';

/**
 * Every submitted entry of an event with where it stands, and disqualifying or reinstating one
 * (BUILD-PLAN decision 18). A disqualified entry leaves the gallery, assignment, the judge
 * console, progress and rankings at once; its data and reviews are kept, and reinstating it
 * brings everything back. The reason is shown to the team. Organisers and admins only; there
 * is no deadline, since rule breaches are often found after judging.
 */
@Injectable()
export class EligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Submitted entries only: drafts stay private to their team. Fixture order first. */
  async list(actor: Actor, eventRef: string): Promise<EntryDto[]> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const rows = await this.prisma.submission.findMany({
      where: { eventId: event.id, status: 'SUBMITTED' },
      include: ENTRY_INCLUDE,
      orderBy: [
        { seedOrder: { sort: 'asc', nulls: 'last' } },
        { submittedAt: 'asc' },
        { id: 'asc' },
      ],
    });
    return rows.map(toEntry);
  }

  async disqualify(actor: Actor, ref: string, dto: DisqualifyDto): Promise<EntryDto> {
    const s = await this.manageable(actor, ref);
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Give a reason (at least 3 characters).',
      );
    }
    if (s.status !== 'SUBMITTED') {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'not_submitted',
        'Only submitted entries can be disqualified.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.submission.updateMany({
        where: { id: s.id, eligibility: 'ELIGIBLE' },
        data: { eligibility: 'DISQUALIFIED', disqualifyReason: reason },
      });
      if (changed.count !== 1) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'already_disqualified',
          'This entry is already disqualified.',
        );
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: s.eventId,
        action: 'submission.disqualified',
        targetType: 'submission',
        targetId: s.id,
        before: { eligibility: 'ELIGIBLE' },
        after: { eligibility: 'DISQUALIFIED', reason, entry: label(s) },
      });
      return toEntry(
        await tx.submission.findUniqueOrThrow({ where: { id: s.id }, include: ENTRY_INCLUDE }),
      );
    });
  }

  async reinstate(actor: Actor, ref: string): Promise<EntryDto> {
    const s = await this.manageable(actor, ref);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.submission.updateMany({
        where: { id: s.id, eligibility: 'DISQUALIFIED' },
        data: { eligibility: 'ELIGIBLE', disqualifyReason: null },
      });
      if (changed.count !== 1) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'not_disqualified',
          'This entry is not disqualified.',
        );
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: s.eventId,
        action: 'submission.reinstated',
        targetType: 'submission',
        targetId: s.id,
        before: { eligibility: 'DISQUALIFIED', reason: s.disqualifyReason },
        after: { eligibility: 'ELIGIBLE', entry: label(s) },
      });
      return toEntry(
        await tx.submission.findUniqueOrThrow({ where: { id: s.id }, include: ENTRY_INCLUDE }),
      );
    });
  }

  /**
   * Deny first, as for reading a submission: someone who organises nothing is refused before
   * the lookup, and an organiser of another event gets the same 403 whether or not the entry
   * exists (drafts must not be probed). Admins get 404 for a missing one.
   */
  private async manageable(actor: Actor, ref: string) {
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const s = await this.prisma.submission.findFirst({ where: byRef(ref) });
    if (!s) {
      if (actor.isAdmin) {
        throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such submission.');
      }
      throw forbidden();
    }
    if (!actor.canManageEvent(s.eventId)) throw forbidden();
    return s;
  }
}
