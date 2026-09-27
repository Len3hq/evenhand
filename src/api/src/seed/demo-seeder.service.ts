import { Injectable } from '@nestjs/common';
import { AuditService } from '../core/audit.service.js';
import { Clock } from '../core/clock.js';
import { PrismaService, type Tx } from '../core/prisma.service.js';
import { hashToken } from '../core/tokens.js';
import type { FixtureFile } from './fixtures.js';

/**
 * Fixed demo tokens. They match the committed .dogfood.toml, so the acceptance checker can
 * run against any fresh `docker compose up`. They contain no `#` (run.py's fallback TOML
 * parser would cut there). They are demo-only: SessionGuard refuses them unless DEMO_MODE=true,
 * and `cli tokens revoke --demo` shuts them for good (a revoked token is not recreated here).
 * A real deployment issues its own with `cli tokens create`.
 */
export const DEMO_TOKENS = {
  organizer: 'dev-organizer-7f2a',
  judge_a: 'dev-judge-a-91bc',
  judge_b: 'dev-judge-b-44de',
  participant: 'dev-participant-2e88',
} as const;
export type DemoRole = keyof typeof DEMO_TOKENS;

export const DEMO_ORGANIZER_EMAIL = 'organizer@evenhand.local';
export const DEMO_ADMIN_EMAIL = 'admin@evenhand.local';
export const DEMO_EVENT_SLUG = 'evenhand-demo';
const DEMO_EVENT_DAYS_OPEN = 7;

export interface DemoLogin {
  role: DemoRole | 'admin';
  email: string;
  header: string | null;
  who: string;
}

/**
 * Demo accounts and data (BUILD-PLAN decisions 26, 33, 49):
 * - organizer + admin accounts;
 * - judge_a = the fixture judge with the most scores (jdg_24), judge_b = the next (jdg_26);
 * - participant = the first member of the first fixture team who is not a judge;
 * - a second, *open* event ("Evenhand Demo Hack", closes 7 days after first boot) so the demo
 *   video can show a real submission — the fixture event is closed by design;
 * - fixed bearer tokens for the four checker roles.
 */
@Injectable()
export class DemoSeeder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async seed(fx: FixtureFile, fixtureEventId: string, passwordHash: string): Promise<DemoLogin[]> {
    return this.prisma.$transaction((tx) => this.run(tx, fx, fixtureEventId, passwordHash), {
      timeout: 60_000,
      maxWait: 10_000,
    });
  }

  private async run(
    tx: Tx,
    fx: FixtureFile,
    fixtureEventId: string,
    passwordHash: string,
  ): Promise<DemoLogin[]> {
    const upsertUser = async (email: string, name: string, isAdmin = false) =>
      (await tx.user.findUnique({ where: { email } })) ??
      tx.user.create({ data: { email, name, isAdmin, passwordHash } });

    const organizer = await upsertUser(DEMO_ORGANIZER_EMAIL, 'Demo Organizer');
    const admin = await upsertUser(DEMO_ADMIN_EMAIL, 'Demo Admin', true);

    // The open demo event, created once; its deadline is not moved on later boots.
    let demo = await tx.event.findUnique({ where: { slug: DEMO_EVENT_SLUG } });
    const createdDemoEvent = !demo;
    if (!demo) {
      const now = this.clock.now();
      demo = await tx.event.create({
        data: {
          slug: DEMO_EVENT_SLUG,
          name: 'Evenhand Demo Hack',
          opensAt: now,
          submissionsClose: new Date(now.getTime() + DEMO_EVENT_DAYS_OPEN * 86_400_000),
          tracks: { create: [{ name: 'Open track' }, { name: 'Developer tools' }] },
          criteria: {
            create: [
              { key: 'functionality', label: 'Functionality', order: 0 },
              { key: 'innovation', label: 'Innovation', order: 1 },
              { key: 'quality', label: 'Quality', order: 2 },
            ],
          },
        },
      });
    }

    for (const eventId of [fixtureEventId, demo.id]) {
      await tx.eventRole.createMany({
        data: [{ userId: organizer.id, eventId, role: 'ORGANIZER' }],
        skipDuplicates: true,
      });
    }

    // judge_a / judge_b: most scores first, ties broken by id (deterministic).
    const counts = new Map<string, number>();
    for (const s of fx.scores) counts.set(s.judge, (counts.get(s.judge) ?? 0) + 1);
    const ranked = [...fx.judges].sort(
      (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.id.localeCompare(b.id),
    );
    const [judgeA, judgeB] = ranked;
    if (!judgeA || !judgeB)
      throw new Error('fixtures need at least two judges for the demo logins');

    // participant: first fixture team member who is not also a judge.
    const judgeEmails = new Set(fx.judges.map((j) => j.email));
    const participantEmail = fx.teams.flatMap((t) => t.members).find((m) => !judgeEmails.has(m));
    if (!participantEmail) throw new Error('fixtures have no team member who is not a judge');

    const userByEmail = async (email: string) => tx.user.findUniqueOrThrow({ where: { email } });
    const participant = await userByEmail(participantEmail);

    // Give the participant a team in the open demo event so they can submit there.
    let demoTeam = await tx.team.findFirst({ where: { eventId: demo.id, name: 'Demo Team' } });
    if (!demoTeam) {
      demoTeam = await tx.team.create({ data: { eventId: demo.id, name: 'Demo Team' } });
    }
    await tx.teamMember.createMany({
      data: [{ teamId: demoTeam.id, userId: participant.id, eventId: demo.id }],
      skipDuplicates: true,
    });
    await tx.eventRole.createMany({
      data: [{ userId: participant.id, eventId: demo.id, role: 'PARTICIPANT' }],
      skipDuplicates: true,
    });

    const holders: Record<DemoRole, { userId: string; who: string }> = {
      organizer: { userId: organizer.id, who: organizer.email },
      judge_a: { userId: (await userByEmail(judgeA.email)).id, who: `${judgeA.id} ${judgeA.name}` },
      judge_b: { userId: (await userByEmail(judgeB.email)).id, who: `${judgeB.id} ${judgeB.name}` },
      participant: { userId: participant.id, who: participant.email },
    };
    for (const [role, token] of Object.entries(DEMO_TOKENS) as [DemoRole, string][]) {
      const tokenHash = hashToken(token);
      const existing = await tx.apiToken.findUnique({ where: { tokenHash } });
      if (!existing) {
        await tx.apiToken.create({
          data: { userId: holders[role].userId, tokenHash, label: `demo:${role}`, isDemo: true },
        });
      }
    }

    if (createdDemoEvent) {
      await this.audit.record(tx, {
        eventId: demo.id,
        action: 'demo.seeded',
        targetType: 'event',
        targetId: demo.id,
        after: {
          demoEvent: DEMO_EVENT_SLUG,
          judgeA: judgeA.id,
          judgeB: judgeB.id,
          participant: participantEmail,
        },
      });
    }

    const emailOf = async (id: string) =>
      (await tx.user.findUniqueOrThrow({ where: { id } })).email;
    return [
      ...(await Promise.all(
        (Object.keys(DEMO_TOKENS) as DemoRole[]).map(async (role) => ({
          role,
          email: await emailOf(holders[role].userId),
          header: `Authorization: Bearer ${DEMO_TOKENS[role]}`,
          who: holders[role].who,
        })),
      )),
      { role: 'admin' as const, email: admin.email, header: null, who: 'platform admin' },
    ];
  }
}
