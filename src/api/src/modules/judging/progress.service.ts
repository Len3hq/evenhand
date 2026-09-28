import { isFlat } from '@evenhand/judging-engine';
import { Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { Clock } from '../../core/clock.js';
import { PrismaService } from '../../core/prisma.service.js';
import { manageableEvent } from '../events/manageable-event.js';
import type { ProgressDto } from './dto/progress.dto.js';
import { IN_JUDGING } from './in-judging.js';

/**
 * The organiser's live view of judging (T2 "a live organizer progress dashboard"): who has not
 * started, what is left per project, and judges whose marks carry no information. Read-only;
 * the page polls it.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async forEvent(actor: Actor, eventRef: string): Promise<ProgressDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const [judges, projects] = await Promise.all([
      this.prisma.eventRole.findMany({
        where: { eventId: event.id, role: 'JUDGE' },
        include: {
          user: { select: { name: true, email: true } },
          judgeTracks: { include: { track: { select: { name: true } } } },
          assignments: {
            where: { submission: IN_JUDGING },
            include: {
              review: {
                select: {
                  status: true,
                  updatedAt: true,
                  scores: { select: { value: true, criterion: { select: { key: true } } } },
                },
              },
            },
          },
        },
        orderBy: [{ externalId: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.submission.findMany({
        where: { eventId: event.id, ...IN_JUDGING },
        include: {
          track: { select: { name: true } },
          assignments: { include: { review: { select: { status: true } } } },
        },
        orderBy: [{ seedOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const judgeRows = judges.map((j) => {
      const reviews = j.assignments.map((a) => a.review);
      const finals = reviews.filter((r) => r?.status === 'FINAL');
      const marks = finals.map((r) =>
        Object.fromEntries(r!.scores.map((s) => [s.criterion.key, s.value])),
      );
      const touched = reviews.flatMap((r) => (r ? [r.updatedAt.getTime()] : []));
      return {
        judgeId: j.id,
        externalId: j.externalId,
        name: j.user.name,
        email: j.user.email,
        tracks: j.judgeTracks.map((jt) => jt.track.name).sort(),
        assigned: j.assignments.length,
        finished: finals.length,
        drafts: reviews.filter((r) => r?.status === 'DRAFT').length,
        notStarted: reviews.filter((r) => !r).length,
        lastActivity: touched.length ? new Date(Math.max(...touched)).toISOString() : null,
        flat: isFlat(marks),
      };
    });

    const projectRows = projects.map((p) => ({
      projectId: p.id,
      externalId: p.externalId,
      title: p.title,
      track: p.track?.name ?? null,
      assigned: p.assignments.length,
      finished: p.assignments.filter((a) => a.review?.status === 'FINAL').length,
      drafts: p.assignments.filter((a) => a.review?.status === 'DRAFT').length,
    }));

    const sum = (f: (j: (typeof judgeRows)[number]) => number) =>
      judgeRows.reduce((s, j) => s + f(j), 0);
    return {
      generatedAt: this.clock.now().toISOString(),
      judgingClose: event.judgingClose?.toISOString() ?? null,
      totals: {
        judges: judgeRows.length,
        judgesNotStarted: judgeRows.filter((j) => j.assigned > 0 && j.notStarted === j.assigned)
          .length,
        projects: projectRows.length,
        projectsUnreviewed: projectRows.filter((p) => p.finished === 0).length,
        assignments: sum((j) => j.assigned),
        finished: sum((j) => j.finished),
        drafts: sum((j) => j.drafts),
        notStarted: sum((j) => j.notStarted),
      },
      judges: judgeRows,
      projects: projectRows,
    };
  }
}
