import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { eventByRef } from '../../core/refs.js';
import type { Criterion } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import type { CriterionDto, RubricDto, RubricInputDto } from './dto/rubric.dto.js';
import { type CriterionSpec, keyFromLabel, lockedChanges, rubricProblems } from './rubric-rules.js';

/**
 * The weighted rubric judges score against (T2). Public to read, so teams know how they will be
 * judged; its event's organisers and admins change it. Once reviews are final, the set of
 * criteria and scored ranges are fixed; labels and weights are not.
 */
@Injectable()
export class RubricService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(eventRef: string): Promise<RubricDto> {
    const event = await this.prisma.event.findFirst({ where: eventByRef(eventRef) });
    if (!event) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such event.');
    return this.read(event.id);
  }

  async replace(actor: Actor, eventRef: string, dto: RubricInputDto): Promise<RubricDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const next: CriterionSpec[] = dto.criteria.map((c) => ({
      key: c.key ?? keyFromLabel(c.label),
      label: c.label.trim(),
      weight: c.weight,
      min: c.min,
      max: c.max,
    }));
    const problems = rubricProblems(next);
    if (problems.length) {
      throw new DomainError(HttpStatus.BAD_REQUEST, 'validation_failed', problems.join('; '));
    }

    await this.prisma.$transaction(async (tx) => {
      const stored = await tx.criterion.findMany({
        where: { eventId: event.id },
        include: { _count: { select: { scores: true } } },
        orderBy: [{ order: 'asc' }, { key: 'asc' }],
      });
      const anyFinal =
        (await tx.review.count({
          where: { status: 'FINAL', assignment: { submission: { eventId: event.id } } },
        })) > 0;
      const locked = lockedChanges(
        stored.map((s) => ({ ...s, scored: s._count.scores > 0 })),
        next,
        anyFinal,
      );
      if (locked.length) {
        throw new DomainError(HttpStatus.CONFLICT, 'rubric_locked', locked.join('; '));
      }
      if (sameRubric(stored, next)) return;

      const nextKeys = new Set(next.map((c) => c.key));
      await tx.criterion.deleteMany({
        where: { eventId: event.id, key: { notIn: [...nextKeys] } },
      });
      for (const [order, c] of next.entries()) {
        await tx.criterion.upsert({
          where: { eventId_key: { eventId: event.id, key: c.key } },
          create: { eventId: event.id, order, ...c },
          update: { order, label: c.label, weight: c.weight, min: c.min, max: c.max },
        });
      }
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'rubric.updated',
        targetType: 'event',
        targetId: event.id,
        before: byKey(stored),
        after: byKey(next),
      });
    });
    return this.read(event.id);
  }

  private async read(eventId: string): Promise<RubricDto> {
    const [criteria, finals] = await Promise.all([
      this.prisma.criterion.findMany({
        where: { eventId },
        orderBy: [{ order: 'asc' }, { key: 'asc' }],
      }),
      this.prisma.review.count({
        where: { status: 'FINAL', assignment: { submission: { eventId } } },
      }),
    ]);
    const total = criteria.reduce((s, c) => s + c.weight, 0);
    return {
      criteria: criteria.map((c): CriterionDto => ({
        key: c.key,
        label: c.label,
        weight: c.weight,
        min: c.min,
        max: c.max,
        order: c.order,
        share: total > 0 ? c.weight / total : 0,
      })),
      locked: finals > 0,
    };
  }
}

/** The audit snapshot: one entry per criterion, keyed by its key, in order. */
function byKey(list: readonly CriterionSpec[]): Record<string, Omit<CriterionSpec, 'key'>> {
  return Object.fromEntries(
    list.map((c) => [c.key, { label: c.label, weight: c.weight, min: c.min, max: c.max }]),
  );
}

function sameRubric(stored: readonly Criterion[], next: readonly CriterionSpec[]): boolean {
  return (
    stored.length === next.length &&
    stored.every((s, i) => {
      const n = next[i]!;
      return (
        s.key === n.key &&
        s.label === n.label &&
        s.weight === n.weight &&
        s.min === n.min &&
        s.max === n.max
      );
    })
  );
}
