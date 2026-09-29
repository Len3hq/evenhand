import { createHash } from 'node:crypto';
import { createRng, shuffle } from '@evenhand/judging-engine';
import { HttpStatus, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
import type { Actor } from '../../core/auth/actor.js';
import { AuditService } from '../../core/audit.service.js';
import { Clock } from '../../core/clock.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService, type Tx } from '../../core/prisma.service.js';
import { byRef, eventByRef } from '../../core/refs.js';
import { generateToken, hashToken } from '../../core/tokens.js';
import type { Prisma, VotingRound } from '../../generated/prisma/client.js';
import { manageableEvent } from '../events/manageable-event.js';
import { PUBLIC_SUBMISSION } from '../gallery/gallery.service.js';
import { IMAGE_ORDER, toImageDto } from '../images/image-dto.js';
import type {
  BallotDto,
  ConfigureVotingDto,
  IssuedPassesDto,
  PublicVotingResultsDto,
  PublicVotingStatusDto,
  VoteTallyDto,
  VotingAdminDto,
  VotingLinkDto,
  VotingRoundDto,
} from './dto/voting.dto.js';

/** Who is voting: a logged-in account (ACCOUNTS) or the holder of a personal voting link. */
export type Voter = { account: Actor } | { passToken: string };

const PROJECT_INCLUDE = {
  team: { select: { name: true } },
  track: { select: { name: true } },
  images: { orderBy: IMAGE_ORDER, take: 1, select: { id: true, width: true, height: true } },
} satisfies Prisma.SubmissionInclude;

const noVote = (): DomainError =>
  new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'This event has no community vote.');

/**
 * Community voting (T3). One round per event, set up by its organisers: a window, an access
 * mode and a number of votes per voter. Voters get a ballot listing the event's public
 * projects in an order of their own, and vote for up to that many different projects while the
 * window is open. The database allows one ballot per account and per voting link, and one vote
 * per project per ballot. Tallies are for organisers only until the vote has closed and they
 * publish the results. Every setting change, vote and withdrawal is audited.
 */
@Injectable()
export class VotingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // ── Organisers ─────────────────────────────────────────────────────────────

  async admin(actor: Actor, eventRef: string): Promise<VotingAdminDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    return this.adminView(event.id);
  }

  /**
   * Creates or changes the round. Dates can move until the results are published; who may vote
   * and how many votes each has cannot change once a vote is cast, since that would change the
   * rules mid-vote.
   */
  async configure(
    actor: Actor,
    eventRef: string,
    dto: ConfigureVotingDto,
  ): Promise<VotingAdminDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (!(closesAt.getTime() > opensAt.getTime())) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'The vote must close after it opens.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.votingRound.findUnique({ where: { eventId: event.id } });
      // Published results are final: reopening the window would let them change afterwards.
      if (before?.resultsPublishedAt) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'voting_published',
          'The results of this vote are published, so it can no longer change.',
        );
      }
      if (before && (before.mode !== dto.mode || before.votesPerVoter !== dto.votesPerVoter)) {
        const cast = await tx.vote.count({ where: { ballot: { roundId: before.id } } });
        if (cast > 0) {
          throw new DomainError(
            HttpStatus.CONFLICT,
            'voting_started',
            'Votes have been cast: who may vote and how many votes each has can no longer change. Dates still can.',
          );
        }
      }
      const data = {
        mode: dto.mode,
        opensAt,
        closesAt,
        votesPerVoter: dto.votesPerVoter,
        // A shared link belongs to an open-link vote only.
        ...(dto.mode === 'OPEN_LINK' ? {} : { linkTokenHash: null }),
      };
      const after = before
        ? await tx.votingRound.update({ where: { id: before.id }, data })
        : await tx.votingRound.create({ data: { eventId: event.id, ...data } });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'voting.configured',
        targetType: 'event',
        targetId: event.id,
        before: before ? settings(before) : null,
        after: settings(after),
      });
    });
    return this.adminView(event.id);
  }

  /** EMAIL_LIST: one personal voting link per new email, each secret returned once. */
  async issuePasses(actor: Actor, eventRef: string, emails: string[]): Promise<IssuedPassesDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const round = await this.roundOf(event.id);
    requireMode(round, 'EMAIL_LIST', 'Personal voting links for listed emails');
    const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const valid = wanted.filter((e) => isEmail(e));
    const skipped = wanted.filter((e) => !isEmail(e));
    return this.prisma.$transaction(async (tx) => {
      const existing = new Set(
        (
          await tx.voterPass.findMany({
            where: { roundId: round.id, email: { in: valid } },
            select: { email: true },
          })
        ).map((p) => p.email),
      );
      const created: IssuedPassesDto['created'] = [];
      for (const email of valid) {
        if (existing.has(email)) {
          skipped.push(email);
          continue;
        }
        const token = generateToken();
        await tx.voterPass.create({
          data: { roundId: round.id, email, tokenHash: hashToken(token) },
        });
        created.push({ email, token });
      }
      if (created.length) {
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'voting.passes_issued',
          targetType: 'event',
          targetId: event.id,
          after: { count: created.length },
        });
      }
      return { created, skipped };
    });
  }

  /** OPEN_LINK: makes the shared link, retiring any earlier one; its secret is returned once. */
  async createLink(actor: Actor, eventRef: string): Promise<VotingLinkDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const round = await this.roundOf(event.id);
    requireMode(round, 'OPEN_LINK', 'A shared voting link');
    const token = generateToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.votingRound.update({
        where: { id: round.id },
        data: { linkTokenHash: hashToken(token) },
      });
      await this.audit.record(tx, {
        actorId: actor.userId,
        eventId: event.id,
        action: 'voting.link_created',
        targetType: 'event',
        targetId: event.id,
        after: { replaced: round.linkTokenHash !== null },
      });
    });
    return { token };
  }

  /** Makes the tallies public. Only once the vote has closed. */
  async publish(actor: Actor, eventRef: string): Promise<VotingAdminDto> {
    const event = await manageableEvent(this.prisma, actor, eventRef);
    const round = await this.roundOf(event.id);
    const now = this.clock.now();
    if (now.getTime() < round.closesAt.getTime()) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'voting_not_closed',
        `The vote closes at ${round.closesAt.toISOString()}; results can be published after that.`,
      );
    }
    if (!round.resultsPublishedAt) {
      await this.prisma.$transaction(async (tx) => {
        await tx.votingRound.update({
          where: { id: round.id },
          data: { resultsPublishedAt: now },
        });
        await this.audit.record(tx, {
          actorId: actor.userId,
          eventId: event.id,
          action: 'voting.results_published',
          targetType: 'event',
          targetId: event.id,
          after: { publishedAt: now },
        });
      });
    }
    return this.adminView(event.id);
  }

  // ── Voters ─────────────────────────────────────────────────────────────────

  /** OPEN_LINK: hands the visitor a personal voting link of their own, while the vote is open. */
  async passFromLink(linkToken: string, ip: string | null): Promise<VotingLinkDto> {
    const round = await this.prisma.votingRound.findUnique({
      where: { linkTokenHash: hashToken(linkToken) },
    });
    if (!round || round.mode !== 'OPEN_LINK') throw invalidLink();
    this.assertOpen(round);
    const token = generateToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.voterPass.create({ data: { roundId: round.id, tokenHash: hashToken(token), ip } });
      await this.audit.record(tx, {
        eventId: round.eventId,
        action: 'voting.link_used',
        targetType: 'event',
        targetId: round.eventId,
        ip,
      });
    });
    return { token };
  }

  async ballot(voter: Voter, eventRef?: string): Promise<BallotDto> {
    const { round, ballotId, userId } = await this.prisma.$transaction((tx) =>
      this.resolve(tx, voter, eventRef),
    );
    const [event, projects, voted, own] = await Promise.all([
      this.prisma.event.findUniqueOrThrow({ where: { id: round.eventId } }),
      this.prisma.submission.findMany({
        where: { eventId: round.eventId, ...PUBLIC_SUBMISSION },
        include: PROJECT_INCLUDE,
        orderBy: { id: 'asc' },
      }),
      this.prisma.vote.findMany({ where: { ballotId }, select: { submissionId: true } }),
      userId
        ? this.prisma.teamMember.findMany({
            where: { userId, eventId: round.eventId },
            select: { teamId: true },
          })
        : Promise.resolve([]),
    ]);
    const votedIds = new Set(voted.map((v) => v.submissionId));
    const ownTeams = new Set(own.map((m) => m.teamId));
    return {
      eventName: event.name,
      eventSlug: event.slug,
      mode: round.mode,
      open: this.isOpen(round),
      closed: this.isClosed(round),
      opensAt: round.opensAt.toISOString(),
      closesAt: round.closesAt.toISOString(),
      votesPerVoter: round.votesPerVoter,
      votesLeft: Math.max(0, round.votesPerVoter - votedIds.size),
      projects: ballotOrder(ballotId, projects).map((p) => ({
        id: p.id,
        externalId: p.externalId,
        title: p.title,
        tagline: p.tagline,
        teamName: p.team.name,
        track: p.track?.name ?? null,
        thumbnailUrl: p.images[0] ? toImageDto(p.images[0]).thumbUrl : null,
        voted: votedIds.has(p.id),
        own: ownTeams.has(p.teamId),
      })),
    };
  }

  async vote(
    voter: Voter,
    projectRef: string,
    ip: string | null,
    eventRef?: string,
  ): Promise<BallotDto> {
    await this.prisma.$transaction(async (tx) => {
      const { round, ballotId, userId } = await this.resolve(tx, voter, eventRef);
      this.assertOpen(round);
      // One voter at a time on a ballot, so two quick clicks cannot pass the vote limit.
      await tx.$queryRaw`SELECT 1 FROM "ballots" WHERE "id" = ${ballotId}::uuid FOR UPDATE`;
      const project = await this.eligible(tx, round.eventId, projectRef);
      if (userId) {
        const member = await tx.teamMember.count({ where: { teamId: project.teamId, userId } });
        if (member) {
          throw new DomainError(
            HttpStatus.FORBIDDEN,
            'own_project',
            'You cannot vote for your own team’s project.',
          );
        }
      }
      const already = await tx.vote.findUnique({
        where: { ballotId_submissionId: { ballotId, submissionId: project.id } },
      });
      if (already) return;
      const used = await tx.vote.count({ where: { ballotId } });
      if (used >= round.votesPerVoter) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'votes_used_up',
          `You have used all ${round.votesPerVoter} of your votes; withdraw one to vote again.`,
        );
      }
      await tx.vote.create({ data: { ballotId, submissionId: project.id } });
      await this.audit.record(tx, {
        actorId: userId,
        eventId: round.eventId,
        action: 'vote.cast',
        targetType: 'submission',
        targetId: project.id,
        after: { ballot: ballotId, project: project.title },
        ip,
      });
    });
    return this.ballot(voter, eventRef);
  }

  async withdraw(
    voter: Voter,
    projectRef: string,
    ip: string | null,
    eventRef?: string,
  ): Promise<BallotDto> {
    await this.prisma.$transaction(async (tx) => {
      const { round, ballotId, userId } = await this.resolve(tx, voter, eventRef);
      this.assertOpen(round);
      const project = await this.eligible(tx, round.eventId, projectRef);
      const removed = await tx.vote.deleteMany({ where: { ballotId, submissionId: project.id } });
      if (!removed.count) return;
      await this.audit.record(tx, {
        actorId: userId,
        eventId: round.eventId,
        action: 'vote.withdrawn',
        targetType: 'submission',
        targetId: project.id,
        after: { ballot: ballotId, project: project.title },
        ip,
      });
    });
    return this.ballot(voter, eventRef);
  }

  // ── Everyone ───────────────────────────────────────────────────────────────

  /** Whether the event has a community vote, and when; 404 when it has none. For anyone. */
  async status(eventRef: string): Promise<PublicVotingStatusDto> {
    const event = await this.prisma.event.findFirst({
      where: eventByRef(eventRef),
      include: { votingRound: true },
    });
    const round = event?.votingRound;
    if (!round) throw noVote();
    return {
      mode: round.mode,
      opensAt: round.opensAt.toISOString(),
      closesAt: round.closesAt.toISOString(),
      open: this.isOpen(round),
      resultsPublished: round.resultsPublishedAt !== null,
    };
  }

  /** Public once the vote has closed and its results are published; 404 before, for everyone. */
  async results(eventRef: string): Promise<PublicVotingResultsDto> {
    const event = await this.prisma.event.findFirst({
      where: eventByRef(eventRef),
      include: { votingRound: true },
    });
    const round = event?.votingRound;
    if (!event || !round?.resultsPublishedAt) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'results_not_published',
        'The community vote results for this event have not been published.',
      );
    }
    const [tallies, ballots] = await Promise.all([
      this.tallies(event.id, round.id),
      this.prisma.ballot.count({ where: { roundId: round.id, votes: { some: {} } } }),
    ]);
    return {
      eventName: event.name,
      closedAt: round.closesAt.toISOString(),
      publishedAt: round.resultsPublishedAt.toISOString(),
      ballots,
      rows: tallies,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** The voter's round and ballot, creating the ballot the first time it is opened. */
  private async resolve(
    tx: Tx,
    voter: Voter,
    eventRef: string | undefined,
  ): Promise<{ round: VotingRound; ballotId: string; userId: string | null }> {
    if ('account' in voter) {
      const event = eventRef ? await tx.event.findFirst({ where: eventByRef(eventRef) }) : null;
      if (!event) throw noVote();
      const round = await tx.votingRound.findUnique({ where: { eventId: event.id } });
      if (!round) throw noVote();
      requireMode(round, 'ACCOUNTS', 'Voting with an account');
      const userId = voter.account.userId;
      const ballot = await tx.ballot.upsert({
        where: { roundId_userId: { roundId: round.id, userId } },
        create: { roundId: round.id, userId },
        update: {},
      });
      return { round, ballotId: ballot.id, userId };
    }
    const pass = await tx.voterPass.findUnique({
      where: { tokenHash: hashToken(voter.passToken) },
      include: { round: true },
    });
    if (!pass) throw invalidLink();
    const ballot = await tx.ballot.upsert({
      where: { passId: pass.id },
      create: { roundId: pass.roundId, passId: pass.id },
      update: {},
    });
    return { round: pass.round, ballotId: ballot.id, userId: null };
  }

  /** A project of this event that is in the public gallery; 404 for anything else. */
  private async eligible(tx: Tx, eventId: string, ref: string) {
    const project = await tx.submission.findFirst({
      where: { eventId, ...PUBLIC_SUBMISSION, ...byRef(ref) },
      select: { id: true, title: true, teamId: true },
    });
    if (!project) {
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such project in this vote.');
    }
    return project;
  }

  private isOpen(round: VotingRound): boolean {
    const t = this.clock.now().getTime();
    return round.opensAt.getTime() <= t && t < round.closesAt.getTime();
  }

  private isClosed(round: VotingRound): boolean {
    return this.clock.now().getTime() >= round.closesAt.getTime();
  }

  /** Votes count only inside the window, by the server clock. */
  private assertOpen(round: VotingRound): void {
    const t = this.clock.now().getTime();
    if (t < round.opensAt.getTime()) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'voting_not_open',
        `Voting opens at ${round.opensAt.toISOString()}.`,
      );
    }
    if (t >= round.closesAt.getTime()) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'voting_closed',
        `Voting closed at ${round.closesAt.toISOString()}.`,
      );
    }
  }

  private async roundOf(eventId: string): Promise<VotingRound> {
    const round = await this.prisma.votingRound.findUnique({ where: { eventId } });
    if (!round) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'wrong_voting_mode',
        'Set up the community vote first.',
      );
    }
    return round;
  }

  private async adminView(eventId: string): Promise<VotingAdminDto> {
    const round = await this.prisma.votingRound.findUnique({ where: { eventId } });
    if (!round) {
      return {
        round: null,
        ballots: 0,
        votes: 0,
        passes: 0,
        repeatAddresses: 0,
        repeatBallots: 0,
        tallies: [],
      };
    }
    const [ballots, votes, passes, tallies, byAddress] = await Promise.all([
      this.prisma.ballot.count({ where: { roundId: round.id, votes: { some: {} } } }),
      this.prisma.vote.count({ where: { ballot: { roundId: round.id } } }),
      this.prisma.voterPass.count({ where: { roundId: round.id } }),
      this.tallies(eventId, round.id),
      this.prisma.voterPass.groupBy({
        by: ['ip'],
        where: { roundId: round.id, ip: { not: null } },
        _count: { _all: true },
      }),
    ]);
    // Duplicate detection for the shared link: an address that took more than one ballot may
    // be one person voting several times (or several people behind one network). Organisers
    // see how many, and those ballots' votes apart in the tally, before deciding to publish;
    // the addresses themselves are never shown.
    const repeats = byAddress.filter((a) => a._count._all > 1);
    const repeatIps = repeats.map((a) => a.ip!);
    const repeatCounts = repeatIps.length
      ? await this.prisma.vote.groupBy({
          by: ['submissionId'],
          where: { ballot: { roundId: round.id, pass: { ip: { in: repeatIps } } } },
          _count: { _all: true },
        })
      : [];
    const repeatVotes = new Map(repeatCounts.map((c) => [c.submissionId, c._count._all]));
    return {
      round: this.roundDto(round),
      ballots,
      votes,
      passes,
      repeatAddresses: repeats.length,
      repeatBallots: repeats.reduce((n, a) => n + a._count._all, 0),
      tallies: tallies.map((t) => ({ ...t, repeatVotes: repeatVotes.get(t.projectId) ?? 0 })),
    };
  }

  /** Every project in the vote with its votes, most first; ties by title. */
  private async tallies(eventId: string, roundId: string): Promise<VoteTallyDto[]> {
    const [projects, counts] = await Promise.all([
      this.prisma.submission.findMany({
        where: { eventId, ...PUBLIC_SUBMISSION },
        include: { team: { select: { name: true } } },
      }),
      this.prisma.vote.groupBy({
        by: ['submissionId'],
        where: { ballot: { roundId } },
        _count: { _all: true },
      }),
    ]);
    const bySubmission = new Map(counts.map((c) => [c.submissionId, c._count._all]));
    return projects
      .map((p) => ({
        projectId: p.id,
        externalId: p.externalId,
        title: p.title,
        teamName: p.team.name,
        votes: bySubmission.get(p.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.votes - a.votes ||
          a.title.localeCompare(b.title) ||
          a.projectId.localeCompare(b.projectId),
      );
  }

  private roundDto(r: VotingRound): VotingRoundDto {
    return {
      mode: r.mode,
      opensAt: r.opensAt.toISOString(),
      closesAt: r.closesAt.toISOString(),
      votesPerVoter: r.votesPerVoter,
      open: this.isOpen(r),
      closed: this.isClosed(r),
      hasLink: r.linkTokenHash !== null,
      resultsPublishedAt: r.resultsPublishedAt?.toISOString() ?? null,
    };
  }
}

/**
 * The ballot's projects in an order of its own: a shuffle seeded from the ballot id, so every
 * voter sees a different order (no project gains from being listed first) and the same voter
 * sees the same order each time. The input is sorted by id first, so the order depends only on
 * the ballot and the set of projects.
 */
export function ballotOrder<T extends { id: string }>(
  ballotId: string,
  projects: readonly T[],
): T[] {
  const seed = createHash('sha256').update(ballotId).digest().readUInt32BE(0);
  const sorted = [...projects].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return shuffle(sorted, createRng(seed));
}

function requireMode(round: VotingRound, mode: VotingRound['mode'], what: string): void {
  if (round.mode !== mode) {
    throw new DomainError(
      HttpStatus.CONFLICT,
      'wrong_voting_mode',
      `${what} is not how this vote works (it is set to ${round.mode}).`,
    );
  }
}

const invalidLink = (): DomainError =>
  new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'This voting link is not valid.');

const settings = (r: VotingRound) => ({
  mode: r.mode,
  opensAt: r.opensAt,
  closesAt: r.closesAt,
  votesPerVoter: r.votesPerVoter,
});
