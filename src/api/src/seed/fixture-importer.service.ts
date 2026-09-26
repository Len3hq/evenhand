import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../core/audit.service.js';
import { PrismaService, type Tx } from '../core/prisma.service.js';
import { detectDuplicates } from './duplicates.js';
import { criterionKeys, type FixtureFile } from './fixtures.js';

export interface ImportSummary {
  eventId: string;
  created: Record<string, number>;
  duplicatesFlagged: number;
}

const FIXTURE_BATCH = 'fixture';

/**
 * Loads fixtures.json into the database. Idempotent: every row is looked up by its natural or
 * fixture key first and only created when missing, so it runs safely on every boot and never
 * overwrites what an organiser has changed since (weights, dates, decisions).
 *
 * Mapping (documented in DATA-MODEL.md → "Fixture import"):
 *   event → Event (external_id, fixture deadline kept as is)   tracks → Track
 *   judges → User + EventRole(JUDGE, external_id) + JudgeTrack
 *   teams → Team + TeamMember + EventRole(PARTICIPANT)
 *   projects → Submission (SUBMITTED, seed_order = file position) + DuplicateFlag
 *   scores → Assignment(batch "fixture") + Review(FINAL) + CriterionScore
 *   criteria = union of score keys, equal weights, range 1–5.
 */
@Injectable()
export class FixtureImporter {
  private readonly logger = new Logger(FixtureImporter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async import(fx: FixtureFile, opts: { passwordHash: string | null }): Promise<ImportSummary> {
    return this.prisma.$transaction((tx) => this.run(tx, fx, opts), {
      timeout: 120_000,
      maxWait: 10_000,
    });
  }

  private async run(
    tx: Tx,
    fx: FixtureFile,
    opts: { passwordHash: string | null },
  ): Promise<ImportSummary> {
    const created: Record<string, number> = {};
    const bump = (k: string): void => {
      created[k] = (created[k] ?? 0) + 1;
    };

    // Event — the fixture deadline is imported as is; it is in the past on purpose.
    let event = await tx.event.findUnique({ where: { externalId: fx.event.id } });
    if (!event) {
      event = await tx.event.create({
        data: {
          externalId: fx.event.id,
          slug: slugify(fx.event.name),
          name: fx.event.name,
          submissionsClose: new Date(fx.event.submissions_close),
        },
      });
      bump('events');
    }
    const eventId = event.id;

    // Tracks
    const trackId = new Map<string, string>();
    for (const t of fx.tracks) {
      let row = await tx.track.findUnique({
        where: { eventId_externalId: { eventId, externalId: t.id } },
      });
      if (!row) {
        row = await tx.track.create({ data: { eventId, externalId: t.id, name: t.name } });
        bump('tracks');
      }
      trackId.set(t.id, row.id);
    }

    // Rubric: the union of criterion keys in the scores, equal weights (decision 31).
    const criterionId = new Map<string, { id: string; min: number; max: number }>();
    for (const [order, key] of criterionKeys(fx.scores).entries()) {
      let row = await tx.criterion.findUnique({ where: { eventId_key: { eventId, key } } });
      if (!row) {
        row = await tx.criterion.create({
          data: { eventId, key, label: titleCase(key), weight: 1, min: 1, max: 5, order },
        });
        bump('criteria');
      }
      criterionId.set(key, { id: row.id, min: row.min, max: row.max });
    }

    // Users: judges carry names; team members only emails, so their name is derived.
    const names = new Map<string, string>();
    for (const team of fx.teams) for (const m of team.members) names.set(m, nameFromEmail(m));
    for (const j of fx.judges) names.set(j.email, j.name);
    const userId = new Map<string, string>();
    for (const [email, name] of names) {
      let row = await tx.user.findUnique({ where: { email } });
      if (!row) {
        row = await tx.user.create({ data: { email, name, passwordHash: opts.passwordHash } });
        bump('users');
      }
      userId.set(email, row.id);
    }

    // Judges and the tracks they may see.
    const judgeRoleId = new Map<string, string>();
    for (const j of fx.judges) {
      const uid = userId.get(j.email)!;
      let role = await tx.eventRole.findUnique({
        where: { userId_eventId_role: { userId: uid, eventId, role: 'JUDGE' } },
      });
      if (!role) {
        role = await tx.eventRole.create({
          data: { userId: uid, eventId, role: 'JUDGE', externalId: j.id },
        });
        bump('judges');
      }
      judgeRoleId.set(j.id, role.id);
      await tx.judgeTrack.createMany({
        data: j.tracks.map((t) => ({ judgeRoleId: role.id, trackId: trackId.get(t)! })),
        skipDuplicates: true,
      });
    }

    // Teams, members and their participant role.
    const teamId = new Map<string, string>();
    for (const t of fx.teams) {
      let row = await tx.team.findUnique({
        where: { eventId_externalId: { eventId, externalId: t.id } },
      });
      if (!row) {
        row = await tx.team.create({ data: { eventId, externalId: t.id, name: t.name } });
        bump('teams');
      }
      teamId.set(t.id, row.id);
      for (const email of t.members) {
        const uid = userId.get(email)!;
        const member = await tx.teamMember.findUnique({
          where: { eventId_userId: { eventId, userId: uid } },
        });
        if (!member) {
          await tx.teamMember.create({ data: { teamId: row.id, userId: uid, eventId } });
          bump('teamMembers');
        } else if (member.teamId !== row.id) {
          this.logger.warn(
            `${email} is on two fixture teams; kept on the first (one team per event)`,
          );
        }
        await tx.eventRole.createMany({
          data: [{ userId: uid, eventId, role: 'PARTICIPANT' }],
          skipDuplicates: true,
        });
      }
    }

    // Submissions. Duplicates are detected before inserting: the earlier copy of a same-team
    // pair is put on hold so the "one live submission per team" index is not violated, and
    // both stay visible until the organiser confirms (decisions 4–7, ADR 0004).
    const pairs = detectDuplicates(
      fx.projects.map((p) => ({
        id: p.id,
        team: p.team,
        title: p.title,
        repoUrl: p.repo_url,
        submittedAt: p.submitted_at,
      })),
    );
    const onHold = new Set(
      pairs.filter((p) => p.reason === 'SAME_TEAM').map((p) => p.supersededId),
    );
    const submissionId = new Map<string, string>();
    for (const [seedOrder, p] of fx.projects.entries()) {
      let row = await tx.submission.findUnique({
        where: { eventId_externalId: { eventId, externalId: p.id } },
      });
      if (!row) {
        row = await tx.submission.create({
          data: {
            eventId,
            teamId: teamId.get(p.team)!,
            trackId: trackId.get(p.track)!,
            externalId: p.id,
            seedOrder,
            title: p.title,
            summary: p.summary || null,
            repoUrl: p.repo_url || null,
            status: 'SUBMITTED',
            submittedAt: new Date(p.submitted_at),
            duplicateHold: onHold.has(p.id),
          },
        });
        bump('submissions');
      }
      submissionId.set(p.id, row.id);
    }

    let duplicatesFlagged = 0;
    for (const pair of pairs) {
      const keptId = submissionId.get(pair.keptId)!;
      const supersededId = submissionId.get(pair.supersededId)!;
      const existing = await tx.duplicateFlag.findUnique({
        where: { keptId_supersededId: { keptId, supersededId } },
      });
      if (existing) continue;
      const flag = await tx.duplicateFlag.create({
        data: { eventId, keptId, supersededId, reason: pair.reason },
      });
      await this.audit.record(tx, {
        eventId,
        action: 'duplicate.flagged',
        targetType: 'duplicate_flag',
        targetId: flag.id,
        after: {
          kept: pair.keptId,
          superseded: pair.supersededId,
          reason: pair.reason,
          source: 'fixtures',
        },
      });
      duplicatesFlagged++;
    }

    // Scores → completed assignments and final reviews. Scores carry no timestamps, so
    // submitted_at stays null. Queue position follows each judge's order in the file.
    const queueLength = new Map<string, number>();
    for (const s of fx.scores) {
      const jr = judgeRoleId.get(s.judge)!;
      const sub = submissionId.get(s.project)!;
      const position = queueLength.get(jr) ?? 0;
      queueLength.set(jr, position + 1);

      let assignment = await tx.assignment.findUnique({
        where: { judgeRoleId_submissionId: { judgeRoleId: jr, submissionId: sub } },
      });
      if (!assignment) {
        assignment = await tx.assignment.create({
          data: {
            judgeRoleId: jr,
            submissionId: sub,
            batch: FIXTURE_BATCH,
            queuePosition: position,
          },
        });
        bump('assignments');
      }
      const review = await tx.review.findUnique({ where: { assignmentId: assignment.id } });
      if (review) continue;
      for (const [key, value] of Object.entries(s.criteria)) {
        const c = criterionId.get(key)!;
        if (value < c.min || value > c.max) {
          throw new Error(
            `score ${s.judge}→${s.project}: ${key}=${value} is outside [${c.min}, ${c.max}]`,
          );
        }
      }
      await tx.review.create({
        data: {
          assignmentId: assignment.id,
          status: 'FINAL',
          comment: s.comment,
          scores: {
            create: Object.entries(s.criteria).map(([key, value]) => ({
              criterionId: criterionId.get(key)!.id,
              value,
            })),
          },
        },
      });
      bump('reviews');
    }

    if (Object.keys(created).length > 0) {
      await this.audit.record(tx, {
        eventId,
        action: 'fixtures.imported',
        targetType: 'event',
        targetId: eventId,
        after: { fixtureEventId: fx.event.id, created, duplicatesFlagged },
      });
    }
    return { eventId, created, duplicatesFlagged };
  }
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event'
  );
}

function titleCase(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "mara.lindqvist@example.org" → "Mara Lindqvist". */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return titleCase(local.replace(/[._+-]+/g, ' ')).trim() || email;
}
