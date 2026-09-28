import { randomBytes } from 'node:crypto';
import { assign } from '@evenhand/judging-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { manageableEvent } from '../events/manageable-event.js';
import type { AssignmentRunDto, RunAssignmentDto } from './dto/assignment.dto.js';
import { IN_JUDGING } from './in-judging.js';

/**
 * Runs the engine's assignment (judging-engine/src/assign.ts) for an event and stores the result
 * as one batch. Existing assignments are kept, finished or not: a run only tops projects up to
 * the target, so it can be run again after late submissions, new judges or track changes.
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async run(actor: Actor, eventRef: string, dto: RunAssignmentDto): Promise<AssignmentRunDto> {
    // 1. permission, 2. the judging window.
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const now = this.clock.now();
    if (event.judgingClose && event.judgingClose <= now) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'judging_closed',
        `Judging closed at ${event.judgingClose.toISOString()}.`,
      );
    }
    const target = dto.target ?? 3;
    // Recorded with the batch, so the same draw can be reproduced from the same data.
    const seed = dto.seed ?? randomBytes(4).readUInt32BE(0);
    const batch = `run-${now.toISOString()}`;

    // 3. read, decide (pure), write + audit: one transaction, so two runs cannot interleave.
    return this.prisma.$transaction(async (tx) => {
      const [submissions, judges, existing, declared] = await Promise.all([
        tx.submission.findMany({
          where: { eventId: event.id, ...IN_JUDGING },
          select: { id: true, title: true, trackId: true, teamId: true },
        }),
        tx.eventRole.findMany({
          where: { eventId: event.id, role: 'JUDGE' },
          include: { user: { select: { name: true } }, judgeTracks: { select: { trackId: true } } },
        }),
        tx.assignment.findMany({
          where: { judgeRole: { eventId: event.id } },
          select: { judgeRoleId: true, submissionId: true, queuePosition: true },
        }),
        tx.conflictOfInterest.findMany({
          where: { judgeRole: { eventId: event.id } },
          select: { judgeRoleId: true, teamId: true },
        }),
      ]);
      // A judge's own team is always a conflict, whatever the table says.
      const ownTeams = await tx.teamMember.findMany({
        where: { eventId: event.id, userId: { in: judges.map((j) => j.userId) } },
        select: { userId: true, teamId: true },
      });
      const conflicts = [
        ...declared.map((c) => ({ judgeId: c.judgeRoleId, teamId: c.teamId })),
        ...ownTeams.flatMap((m) =>
          judges
            .filter((j) => j.userId === m.userId)
            .map((j) => ({ judgeId: j.id, teamId: m.teamId })),
        ),
      ];

      const result = assign({
        projects: submissions.map((s) => ({ id: s.id, trackId: s.trackId, teamId: s.teamId })),
        judges: judges.map((j) => ({ id: j.id, trackIds: j.judgeTracks.map((t) => t.trackId) })),
        existing: existing.map((e) => ({ judgeId: e.judgeRoleId, projectId: e.submissionId })),
        conflicts,
        target,
        seed,
      });

      // New work goes to the end of each judge's queue, in the engine's shuffled order.
      const nextPosition = new Map<string, number>();
      for (const e of existing) {
        nextPosition.set(
          e.judgeRoleId,
          Math.max(nextPosition.get(e.judgeRoleId) ?? 0, e.queuePosition + 1),
        );
      }
      if (result.added.length) {
        await tx.assignment.createMany({
          data: result.added.map((a) => ({
            judgeRoleId: a.judgeId,
            submissionId: a.projectId,
            batch,
            queuePosition: (nextPosition.get(a.judgeId) ?? 0) + a.order,
          })),
        });
      }

      const title = new Map(submissions.map((s) => [s.id, s.title]));
      const shortfalls = result.shortfalls.map((s) => ({ ...s, title: title.get(s.projectId)! }));
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'assignment.run',
        targetType: 'event',
        targetId: event.id,
        after: {
          batch,
          seed,
          target,
          added: result.added.length,
          shortfalls: shortfalls.length,
          components: result.components,
        },
      });

      const addedBy = new Map<string, number>();
      for (const a of result.added) addedBy.set(a.judgeId, (addedBy.get(a.judgeId) ?? 0) + 1);
      return {
        batch,
        seed,
        target,
        projects: submissions.length,
        added: result.added.length,
        judges: judges
          .map((j) => ({
            judgeId: j.id,
            name: j.user.name,
            added: addedBy.get(j.id) ?? 0,
            total: result.load[j.id] ?? 0,
          }))
          .sort((a, b) => b.added - a.added || (a.name < b.name ? -1 : 1)),
        shortfalls,
        components: result.components,
      };
    });
  }
}
