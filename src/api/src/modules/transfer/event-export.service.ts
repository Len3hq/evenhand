import { Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { PrismaService } from '../../core/prisma.service.js';
import type { Event } from '../../generated/prisma/client.js';
import type { EventExtension } from '../../seed/extension.js';
import type { FixtureFile, FixtureProject, FixtureScore } from '../../seed/fixtures.js';
import { manageableEvent } from '../events/manageable-event.js';

/** fixtures.json's shape plus our optional extras. */
export type EventExportFile = FixtureFile & { evenhand: EventExtension };

/**
 * The shared shape needs every project in a track; a project without one is exported in this
 * placeholder track, so the file stays valid for any importer.
 */
export const NO_TRACK = { id: 'evenhand-no-track', name: 'No track' } as const;

/**
 * Writes an event out in the organisers' fixtures.json shape, which every DOGFOOD portal can
 * read, so an event can move from Evenhand to another portal and back. What that shape cannot
 * hold travels in the `evenhand` block.
 *
 * Ids are fixture ids where the row has one, else our own ids, and every list is sorted by
 * those ids (projects by their original order), so exporting, importing into an empty portal
 * and exporting again gives the same file. Only submitted projects and final reviews are
 * exported: drafts stay private, and unfinished reviews are not scores.
 */
@Injectable()
export class EventExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** For the API: the event's organisers and admins only. */
  async exportFor(actor: Actor, eventRef: string): Promise<EventExportFile> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    return this.export(event);
  }

  async export(event: Event): Promise<EventExportFile> {
    const [tracks, prizes, criteria, judges, teams, submissions] = await Promise.all([
      this.prisma.track.findMany({ where: { eventId: event.id } }),
      this.prisma.prize.findMany({ where: { eventId: event.id } }),
      this.prisma.criterion.findMany({ where: { eventId: event.id } }),
      this.prisma.eventRole.findMany({
        where: { eventId: event.id, role: 'JUDGE' },
        include: { user: true, judgeTracks: true },
      }),
      this.prisma.team.findMany({
        where: { eventId: event.id },
        include: { members: { include: { user: { select: { email: true } } } } },
      }),
      this.prisma.submission.findMany({ where: { eventId: event.id, status: 'SUBMITTED' } }),
    ]);

    const trackRef = refMap(tracks);
    const teamRef = refMap(teams);
    const judgeRef = refMap(judges);
    const projectRef = refMap(submissions);
    const needsNoTrack = submissions.some((s) => !s.trackId);

    const projects = [...submissions]
      .sort(
        (a, b) =>
          (a.seedOrder ?? Number.MAX_SAFE_INTEGER) - (b.seedOrder ?? Number.MAX_SAFE_INTEGER) ||
          cmp(projectRef.get(a.id)!, projectRef.get(b.id)!),
      )
      .map((s): FixtureProject => ({
        id: projectRef.get(s.id)!,
        team: teamRef.get(s.teamId)!,
        track: s.trackId ? trackRef.get(s.trackId)! : NO_TRACK.id,
        title: s.title,
        summary: s.summary ?? '',
        repo_url: s.repoUrl ?? '',
        submitted_at: (s.submittedAt ?? s.updatedAt).toISOString(),
      }));
    const position = new Map(projects.map((p, i) => [p.id, i]));

    const reviews = await this.prisma.review.findMany({
      where: {
        status: 'FINAL',
        superseded: false,
        assignment: { submissionId: { in: submissions.map((s) => s.id) } },
      },
      include: { assignment: true, scores: { include: { criterion: { select: { key: true } } } } },
    });
    const scores = reviews
      .map((r) => ({
        judge: judgeRef.get(r.assignment.judgeRoleId)!,
        project: projectRef.get(r.assignment.submissionId)!,
        criteria: Object.fromEntries(
          [...r.scores]
            .sort((a, b) => cmp(a.criterion.key, b.criterion.key))
            .map((s) => [s.criterion.key, s.value]),
        ),
        comment: r.comment,
      }))
      .sort(
        (a, b) => cmp(a.judge, b.judge) || position.get(a.project)! - position.get(b.project)!,
      ) satisfies FixtureScore[];

    const byRef = new Map(submissions.map((s) => [projectRef.get(s.id)!, s]));
    const extras: NonNullable<EventExtension['projects']> = {};
    for (const p of projects) {
      const s = byRef.get(p.id)!;
      const x = {
        ...(s.tagline && { tagline: s.tagline }),
        ...(s.description && { description: s.description }),
        ...(s.demoVideoUrl && { demo_video_url: s.demoVideoUrl }),
        ...(s.liveUrl && { live_url: s.liveUrl }),
        ...(s.techTags.length && { tech_tags: s.techTags }),
      };
      if (Object.keys(x).length) extras[p.id] = x;
    }

    return {
      event: {
        id: event.externalId ?? event.id,
        name: event.name,
        submissions_close: event.submissionsClose.toISOString(),
      },
      tracks: sortById([
        ...tracks.map((t) => ({ id: trackRef.get(t.id)!, name: t.name })),
        ...(needsNoTrack ? [{ ...NO_TRACK }] : []),
      ]),
      judges: sortById(
        judges.map((j) => ({
          id: judgeRef.get(j.id)!,
          name: j.user.name,
          email: j.user.email,
          tracks: j.judgeTracks.map((jt) => trackRef.get(jt.trackId)!).sort(cmp),
        })),
      ),
      teams: sortById(
        teams.map((t) => ({
          id: teamRef.get(t.id)!,
          name: t.name,
          members: t.members.map((m) => m.user.email).sort(cmp),
        })),
      ),
      projects,
      scores,
      evenhand: {
        version: 1,
        event: {
          slug: event.slug,
          opens_at: event.opensAt?.toISOString() ?? null,
          judging_close: event.judgingClose?.toISOString() ?? null,
        },
        prizes: prizes
          .map((p) => ({
            name: p.name,
            description: p.description,
            track: p.trackId ? trackRef.get(p.trackId)! : null,
          }))
          .sort((a, b) => cmp(a.track ?? '', b.track ?? '') || cmp(a.name, b.name)),
        criteria: criteria
          .map((c) => ({
            key: c.key,
            label: c.label,
            weight: c.weight,
            min: c.min,
            max: c.max,
            order: c.order,
          }))
          .sort((a, b) => a.order - b.order || cmp(a.key, b.key)),
        projects: extras,
      },
    };
  }
}

/** Row id → the id it is exported under: its fixture id if it has one. */
function refMap(rows: { id: string; externalId: string | null }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.externalId ?? r.id]));
}

/** Plain code-unit order: the same on every machine and locale. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sortById = <T extends { id: string }>(list: T[]): T[] => list.sort((a, b) => cmp(a.id, b.id));
