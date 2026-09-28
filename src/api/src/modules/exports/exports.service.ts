import { Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { type CsvCell, toCsv } from '../../core/csv.js';
import { PrismaService } from '../../core/prisma.service.js';
import type { Event } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import { questionsOf } from '../events/questions.service.js';

export interface CsvFile {
  filename: string;
  csv: string;
}

/**
 * The event's CSV exports at every stage (teams, submissions, assignments), beside scores.csv
 * and audit.csv. The event's organisers and admins. Fixture ids are used where a row has one, so
 * a CSV can be joined back to fixtures.json; rows are in a stable order.
 */
@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async teams(actor: Actor, eventRef: string): Promise<CsvFile> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const teams = await this.prisma.team.findMany({
      where: { eventId: event.id },
      include: {
        members: {
          include: { user: { select: { name: true, email: true } } },
          orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        },
      },
      orderBy: [{ externalId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const rows = teams.flatMap((t) =>
      (t.members.length ? t.members : [null]).map((m): CsvCell[] => [
        t.externalId ?? t.id,
        t.name,
        m?.user.name ?? '',
        m?.user.email ?? '',
        m?.joinedAt.toISOString() ?? '',
      ]),
    );
    return file(
      event,
      'teams',
      ['team_id', 'team_name', 'member_name', 'member_email', 'joined_at'],
      rows,
    );
  }

  async submissions(actor: Actor, eventRef: string): Promise<CsvFile> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const subs = await this.prisma.submission.findMany({
      where: { eventId: event.id },
      include: {
        team: { select: { id: true, externalId: true, name: true } },
        track: { select: { id: true, externalId: true, name: true } },
        supersededBy: { select: { id: true, externalId: true } },
        answers: { select: { questionId: true, value: true } },
      },
      orderBy: [{ seedOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    // One column per custom question, in the order teams see them. Prompts are unique within
    // an event, and the prefix keeps them apart from the fixed columns.
    const questions = await questionsOf(this.prisma, event.id);
    const header = [
      'project_id',
      'title',
      'team_id',
      'team_name',
      'track_id',
      'track',
      'status',
      'eligibility',
      'submitted_at',
      'repo_url',
      'demo_video_url',
      'live_url',
      'tech_tags',
      'duplicate_hold',
      'superseded_by',
      ...questions.map((q) => `answer: ${q.prompt}`),
    ];
    const rows = subs.map((s): CsvCell[] => [
      s.externalId ?? s.id,
      s.title,
      s.team.externalId ?? s.team.id,
      s.team.name,
      s.track ? (s.track.externalId ?? s.track.id) : '',
      s.track?.name ?? '',
      s.status,
      s.eligibility,
      s.submittedAt?.toISOString() ?? '',
      s.repoUrl ?? '',
      s.demoVideoUrl ?? '',
      s.liveUrl ?? '',
      s.techTags.join(';'),
      s.duplicateHold,
      s.supersededBy ? (s.supersededBy.externalId ?? s.supersededBy.id) : '',
      ...questions.map((q) => s.answers.find((a) => a.questionId === q.id)?.value ?? ''),
    ]);
    return file(event, 'submissions', header, rows);
  }

  async assignments(actor: Actor, eventRef: string): Promise<CsvFile> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const rows = await this.prisma.assignment.findMany({
      where: { judgeRole: { eventId: event.id } },
      include: {
        judgeRole: { select: { id: true, externalId: true, user: { select: { name: true } } } },
        submission: {
          select: { id: true, externalId: true, title: true, track: { select: { name: true } } },
        },
        review: { select: { status: true, submittedAt: true } },
      },
    });
    const judgeRef = (a: (typeof rows)[number]) => a.judgeRole.externalId ?? a.judgeRole.id;
    rows.sort(
      (a, b) =>
        (judgeRef(a) < judgeRef(b) ? -1 : judgeRef(a) > judgeRef(b) ? 1 : 0) ||
        a.queuePosition - b.queuePosition,
    );
    const header = [
      'judge_id',
      'judge_name',
      'project_id',
      'project_title',
      'track',
      'batch',
      'queue_position',
      'state',
      'submitted_at',
    ];
    const cells = rows.map((a): CsvCell[] => [
      judgeRef(a),
      a.judgeRole.user.name,
      a.submission.externalId ?? a.submission.id,
      a.submission.title,
      a.submission.track?.name ?? '',
      a.batch,
      a.queuePosition,
      a.review?.status === 'FINAL' ? 'FINAL' : a.review ? 'DRAFT' : 'NOT_STARTED',
      a.review?.submittedAt?.toISOString() ?? '',
    ]);
    return file(event, 'assignments', header, cells);
  }
}

function file(event: Event, name: string, header: string[], rows: CsvCell[][]): CsvFile {
  return { filename: `${event.slug}-${name}.csv`, csv: toCsv(header, rows) };
}
