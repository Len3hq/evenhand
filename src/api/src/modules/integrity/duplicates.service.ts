import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { isUuid } from '../../core/refs.js';
import { Prisma } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import type { DuplicateDto, DuplicateMergeDto } from './dto/integrity.dto.js';
import { ENTRY_INCLUDE, label, toEntry } from './entries.js';

const FLAG_INCLUDE = {
  kept: { include: ENTRY_INCLUDE },
  superseded: { include: ENTRY_INCLUDE },
} satisfies Prisma.DuplicateFlagInclude;

type FlagRow = Prisma.DuplicateFlagGetPayload<{ include: typeof FLAG_INCLUDE }>;

/**
 * The organiser's decision on a suspected duplicate (BUILD-PLAN §8, decisions 5–7).
 *
 * - **Confirm** keeps the newer entry. The older one is replaced (`superseded_by_id`) and
 *   leaves the gallery and judging. Reviews of the older copy by judges who did not review
 *   the newer one move across (recording `original_submission_id`), so no judge's work is
 *   lost; reviews by judges who reviewed both are set aside (`superseded`), so no judge counts
 *   twice. On the fixtures: Dry Harbour ends with 6 reviews.
 * - **Dismiss** says they are different projects. Refused for one team's two entries: a team
 *   has one live entry, so both cannot stay.
 * - **Reopen** undoes either decision exactly, back to pending.
 *
 * Every decision changes the reviews a ranking reads, so the latest ranking run goes out of
 * date by itself (its inputs hash no longer matches) and must be run again before publishing.
 */
@Injectable()
export class DuplicatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** Every flag of the event, oldest first. The event's organisers and admins. */
  async list(actor: Actor, eventRef: string): Promise<DuplicateDto[]> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const flags = await this.prisma.duplicateFlag.findMany({
      where: { eventId: event.id },
      include: FLAG_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(flags.map((f) => this.present(this.prisma, f)));
  }

  async confirm(actor: Actor, id: string): Promise<DuplicateDto> {
    const flag = await this.ownFlag(actor, id);
    return this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, flag.id);
      // Lock both entries (in a fixed order), then read them afresh: a concurrent decision on
      // another flag sharing an entry is then seen by the chain check instead of racing it.
      await tx.$queryRaw`SELECT id FROM submissions WHERE id IN (${flag.keptId}::uuid, ${flag.supersededId}::uuid) ORDER BY id FOR UPDATE`;
      const f = await reload(tx, flag.id);
      const blocked = await this.confirmBlockedBy(tx, f);
      if (blocked) throw blocked;

      const plan = await this.mergePlan(tx, f);
      await tx.submission.update({
        where: { id: f.supersededId },
        data: { supersededById: f.keptId, duplicateHold: false },
      });
      for (const a of plan.move) {
        await tx.assignment.update({ where: { id: a.id }, data: { submissionId: f.keptId } });
        await tx.review.update({
          where: { id: a.reviewId },
          data: { originalSubmissionId: f.supersededId },
        });
      }
      await tx.review.updateMany({
        where: { id: { in: plan.setAside.map((a) => a.reviewId) } },
        data: { superseded: true },
      });
      await tx.duplicateFlag.update({
        where: { id: f.id },
        data: { status: 'CONFIRMED', decidedById: actor.userId, decidedAt: this.clock.now() },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: f.eventId,
        action: 'duplicate.confirmed',
        targetType: 'duplicate_flag',
        targetId: f.id,
        before: { status: 'PENDING' },
        after: {
          status: 'CONFIRMED',
          kept: label(f.kept),
          superseded: label(f.superseded),
          moved: names(plan.move),
          setAside: names(plan.setAside),
        },
      });
      return this.present(tx, await reload(tx, f.id));
    });
  }

  async dismiss(actor: Actor, id: string): Promise<DuplicateDto> {
    const flag = await this.ownFlag(actor, id);
    return this.prisma.$transaction(async (tx) => {
      const f = await this.lockPending(tx, flag.id);
      if (f.reason === 'SAME_TEAM') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'duplicate_same_team',
          'Both entries belong to one team, and a team has one live entry: confirm to keep the newer one.',
        );
      }
      await tx.duplicateFlag.update({
        where: { id: f.id },
        data: { status: 'DISMISSED', decidedById: actor.userId, decidedAt: this.clock.now() },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: f.eventId,
        action: 'duplicate.dismissed',
        targetType: 'duplicate_flag',
        targetId: f.id,
        before: { status: 'PENDING' },
        after: { status: 'DISMISSED', kept: label(f.kept), superseded: label(f.superseded) },
      });
      return this.present(tx, await reload(tx, f.id));
    });
  }

  /** Undoes a confirmation or a dismissal, back to pending. */
  async reopen(actor: Actor, id: string): Promise<DuplicateDto> {
    const flag = await this.ownFlag(actor, id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const f = await reload(tx, flag.id);
        const changed = await tx.duplicateFlag.updateMany({
          where: { id: f.id, status: { not: 'PENDING' } },
          data: { status: 'PENDING', decidedById: null, decidedAt: null },
        });
        if (changed.count !== 1) throw undecided();

        let movedBack: string[] = [];
        let restored: string[] = [];
        if (f.status === 'CONFIRMED') {
          const moved = await tx.assignment.findMany({
            where: { submissionId: f.keptId, review: { originalSubmissionId: f.supersededId } },
            include: { review: true, judgeRole: { include: { user: { select: { name: true } } } } },
          });
          for (const a of moved) {
            await tx.assignment.update({
              where: { id: a.id },
              data: { submissionId: f.supersededId },
            });
            await tx.review.update({
              where: { id: a.review!.id },
              data: { originalSubmissionId: null },
            });
          }
          const setAside = await tx.assignment.findMany({
            where: { submissionId: f.supersededId, review: { superseded: true } },
            include: { review: true, judgeRole: { include: { user: { select: { name: true } } } } },
          });
          await tx.review.updateMany({
            where: { id: { in: setAside.map((a) => a.review!.id) } },
            data: { superseded: false },
          });
          // Back on hold if it is one team's second entry, else live again.
          await tx.submission.update({
            where: { id: f.supersededId },
            data: { supersededById: null, duplicateHold: f.reason === 'SAME_TEAM' },
          });
          movedBack = moved.map((a) => a.judgeRole.user.name).sort();
          restored = setAside.map((a) => a.judgeRole.user.name).sort();
        }
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: f.eventId,
          action: 'duplicate.reopened',
          targetType: 'duplicate_flag',
          targetId: f.id,
          before: { status: f.status },
          after: {
            status: 'PENDING',
            kept: label(f.kept),
            superseded: label(f.superseded),
            movedBack,
            restored,
          },
        });
        return this.present(tx, await reload(tx, f.id));
      });
    } catch (e) {
      // The older entry's team has another live entry now: it cannot come back live.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'team_already_has_submission',
          'The older entry’s team has another live entry now, so it cannot be restored.',
        );
      }
      throw e;
    }
  }

  /** Deny first: someone who organises nothing is refused before the flag is looked up. */
  private async ownFlag(actor: Actor, id: string) {
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const flag = isUuid(id) ? await this.prisma.duplicateFlag.findUnique({ where: { id } }) : null;
    if (!flag) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such duplicate.');
    if (!actor.canManageEvent(flag.eventId)) throw forbidden();
    return flag;
  }

  /** Moves the flag out of PENDING atomically, so two organisers cannot both decide it. */
  private async lockPending(tx: Tx, id: string): Promise<FlagRow> {
    const f = await reload(tx, id);
    const locked = await tx.duplicateFlag.updateMany({
      where: { id, status: 'PENDING' },
      data: { decidedAt: this.clock.now() },
    });
    if (locked.count !== 1) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'duplicate_decided',
        `This duplicate was already ${f.status.toLowerCase()}; reopen it first.`,
      );
    }
    return f;
  }

  /**
   * Confirming is refused when either entry already took part in another confirmed decision:
   * chains of merges could not be undone one step at a time.
   */
  private async confirmBlockedBy(tx: Tx | PrismaService, f: FlagRow): Promise<DomainError | null> {
    if (f.kept.supersededById || f.superseded.supersededById) {
      return new DomainError(
        HttpStatus.CONFLICT,
        'duplicate_chain',
        'One of these entries was already replaced by another duplicate decision; reopen that one first.',
      );
    }
    const other = await tx.duplicateFlag.findFirst({
      where: {
        id: { not: f.id },
        status: 'CONFIRMED',
        OR: [f.keptId, f.supersededId].flatMap((s) => [{ keptId: s }, { supersededId: s }]),
      },
    });
    return other
      ? new DomainError(
          HttpStatus.CONFLICT,
          'duplicate_chain',
          'One of these entries is part of another confirmed duplicate; reopen that one first.',
        )
      : null;
  }

  /** Which reviews of the older copy would move across, and which would be set aside. */
  private async mergePlan(tx: Tx | PrismaService, f: FlagRow) {
    const [older, onKept] = await Promise.all([
      tx.assignment.findMany({
        where: { submissionId: f.supersededId, review: { isNot: null } },
        include: { review: true, judgeRole: { include: { user: { select: { name: true } } } } },
      }),
      tx.assignment.findMany({ where: { submissionId: f.keptId }, select: { judgeRoleId: true } }),
    ]);
    const judgesOfKept = new Set(onKept.map((a) => a.judgeRoleId));
    const rows = older.map((a) => ({
      id: a.id,
      reviewId: a.review!.id,
      judge: a.judgeRole.user.name,
      both: judgesOfKept.has(a.judgeRoleId),
    }));
    return { move: rows.filter((r) => !r.both), setAside: rows.filter((r) => r.both) };
  }

  private async present(tx: Tx | PrismaService, f: FlagRow): Promise<DuplicateDto> {
    let merge: DuplicateMergeDto = { moved: [], setAside: [] };
    let blockedBy: string | null = null;
    if (f.status === 'PENDING') {
      const plan = await this.mergePlan(tx, f);
      merge = { moved: names(plan.move), setAside: names(plan.setAside) };
      blockedBy = (await this.confirmBlockedBy(tx, f))?.message ?? null;
    } else if (f.status === 'CONFIRMED') {
      const [moved, setAside] = await Promise.all([
        tx.assignment.findMany({
          where: { submissionId: f.keptId, review: { originalSubmissionId: f.supersededId } },
          include: { judgeRole: { include: { user: { select: { name: true } } } } },
        }),
        tx.assignment.findMany({
          where: { submissionId: f.supersededId, review: { superseded: true } },
          include: { judgeRole: { include: { user: { select: { name: true } } } } },
        }),
      ]);
      merge = {
        moved: moved.map((a) => a.judgeRole.user.name).sort(),
        setAside: setAside.map((a) => a.judgeRole.user.name).sort(),
      };
    }
    const decidedBy = f.decidedById
      ? ((await tx.user.findUnique({ where: { id: f.decidedById }, select: { name: true } }))
          ?.name ?? null)
      : null;
    return {
      id: f.id,
      eventId: f.eventId,
      reason: f.reason,
      status: f.status,
      kept: toEntry(f.kept),
      superseded: toEntry(f.superseded),
      merge,
      blockedBy,
      decidedBy,
      decidedAt: f.status === 'PENDING' ? null : (f.decidedAt?.toISOString() ?? null),
      createdAt: f.createdAt.toISOString(),
    };
  }
}

const reload = (tx: Tx | PrismaService, id: string): Promise<FlagRow> =>
  tx.duplicateFlag.findUniqueOrThrow({ where: { id }, include: FLAG_INCLUDE });

const names = (rows: { judge: string }[]): string[] => rows.map((r) => r.judge).sort();

const undecided = (): DomainError =>
  new DomainError(HttpStatus.CONFLICT, 'duplicate_decided', 'This duplicate is still pending.');
