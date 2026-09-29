import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public, VoteRateLimit } from '../../core/auth/decorators.js';
import {
  BallotDto,
  CastVoteDto,
  ConfigureVotingDto,
  IssuedPassesDto,
  IssuePassesDto,
  PublicVotingResultsDto,
  PublicVotingStatusDto,
  TakenPassDto,
  VotingAdminDto,
  VotingLinkDto,
} from './dto/voting.dto.js';
import { VotingService } from './voting.service.js';

const EVENT = { name: 'ref', description: 'Event id, fixture id (evt_01) or slug.' };
const PROJECT = { name: 'project', description: 'Project id or fixture id (prj_01).' };
const PASS = { name: 'token', description: 'The secret of a personal voting link.' };

const ip = (req: Request): string | null => req.ip ?? null;

/**
 * The voter's own address, only when a proxy in front of the portal reported it. Without one,
 * every browser reaches the API through the web container and would share its address.
 */
const reportedAddress = (req: Request): string | null =>
  req.headers['x-forwarded-for'] ? ip(req) : null;

/** One cookie per vote, holding the ballot this browser took from its shared link. */
const ballotCookie = (roundId: string): string => `evenhand_ballot_${roundId}`;
const BALLOT_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

@ApiTags('voting')
@Controller()
export class VotingController {
  constructor(private readonly voting: VotingService) {}

  // ── Organisers ─────────────────────────────────────────────────────────────

  /** The event's community vote: settings, counts and the running tally. Organisers and admins. */
  @ApiParam(EVENT)
  @Get('events/:ref/voting')
  admin(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<VotingAdminDto> {
    return this.voting.admin(actor, ref);
  }

  /** Set up or change the vote. Mode and votes per voter are fixed once a vote is cast. */
  @ApiParam(EVENT)
  @Put('events/:ref/voting')
  configure(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Body() dto: ConfigureVotingDto,
  ): Promise<VotingAdminDto> {
    return this.voting.configure(actor, ref, dto);
  }

  /** EMAIL_LIST: make a personal voting link for each new email. The secrets are shown once. */
  @ApiParam(EVENT)
  @Post('events/:ref/voting/passes')
  issuePasses(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Body() dto: IssuePassesDto,
  ): Promise<IssuedPassesDto> {
    return this.voting.issuePasses(actor, ref, dto.emails);
  }

  /** OPEN_LINK: make the shared voting link, retiring any earlier one. Shown once. */
  @ApiParam(EVENT)
  @Post('events/:ref/voting/link')
  createLink(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<VotingLinkDto> {
    return this.voting.createLink(actor, ref);
  }

  /** Publish the vote's results. Only after the vote has closed. */
  @ApiParam(EVENT)
  @Post('events/:ref/voting/publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<VotingAdminDto> {
    return this.voting.publish(actor, ref);
  }

  // ── Voters with an account (ACCOUNTS) ──────────────────────────────────────

  /** Your ballot for the event's vote, in its own order. Anyone logged in. */
  @ApiParam(EVENT)
  @Get('events/:ref/ballot')
  ballot(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<BallotDto> {
    return this.voting.ballot({ account: actor }, ref);
  }

  /** Vote for a project. Voting twice for the same one changes nothing. */
  @ApiParam(EVENT)
  @VoteRateLimit()
  @Post('events/:ref/ballot/votes')
  @HttpCode(HttpStatus.OK)
  vote(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Body() dto: CastVoteDto,
    @Req() req: Request,
  ): Promise<BallotDto> {
    return this.voting.vote({ account: actor }, dto.project, ip(req), ref);
  }

  /** Withdraw your vote for a project, while the vote is open. */
  @ApiParam(EVENT)
  @ApiParam(PROJECT)
  @VoteRateLimit()
  @Delete('events/:ref/ballot/votes/:project')
  withdraw(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Param('project') project: string,
    @Req() req: Request,
  ): Promise<BallotDto> {
    return this.voting.withdraw({ account: actor }, project, ip(req), ref);
  }

  // ── Voters with a personal link (EMAIL_LIST, OPEN_LINK) ────────────────────

  /** The ballot behind a personal voting link. The link's secret is the credential. */
  @Public()
  @ApiParam(PASS)
  @Get('voting/passes/:token/ballot')
  passBallot(@Param('token') token: string): Promise<BallotDto> {
    return this.voting.ballot({ passToken: token });
  }

  @Public()
  @ApiParam(PASS)
  @VoteRateLimit()
  @Post('voting/passes/:token/votes')
  @HttpCode(HttpStatus.OK)
  passVote(
    @Param('token') token: string,
    @Body() dto: CastVoteDto,
    @Req() req: Request,
  ): Promise<BallotDto> {
    return this.voting.vote({ passToken: token }, dto.project, ip(req));
  }

  @Public()
  @ApiParam(PASS)
  @ApiParam(PROJECT)
  @VoteRateLimit()
  @Delete('voting/passes/:token/votes/:project')
  passWithdraw(
    @Param('token') token: string,
    @Param('project') project: string,
    @Req() req: Request,
  ): Promise<BallotDto> {
    return this.voting.withdraw({ passToken: token }, project, ip(req));
  }

  /**
   * OPEN_LINK: take a personal voting link from the shared one. A browser that already took
   * one gets the same one back (an httpOnly cookie remembers it). Rate limited per address.
   */
  @Public()
  @ApiParam({ name: 'token', description: 'The secret of the shared voting link.' })
  @VoteRateLimit()
  @Post('voting/links/:token/passes')
  async passFromLink(
    @Param('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TakenPassDto> {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const pass = await this.voting.passFromLink(
      token,
      ip(req),
      reportedAddress(req),
      (roundId) => cookies[ballotCookie(roundId)],
    );
    res.cookie(ballotCookie(pass.roundId), pass.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      path: '/api/voting',
      // Longer than any vote runs; the organisers can move the closing date later.
      maxAge: BALLOT_COOKIE_MAX_AGE_MS,
    });
    return { token: pass.token, reused: pass.reused };
  }

  // ── Everyone ───────────────────────────────────────────────────────────────

  /** Whether the event has a community vote, its window and whether it is open now. */
  @Public()
  @ApiParam(EVENT)
  @Get('events/:ref/votes')
  status(@Param('ref') ref: string): Promise<PublicVotingStatusDto> {
    return this.voting.status(ref);
  }

  /** The vote's results, once the organisers publish them after it closes; 404 before. */
  @Public()
  @ApiParam(EVENT)
  @Get('events/:ref/votes/results')
  results(@Param('ref') ref: string): Promise<PublicVotingResultsDto> {
    return this.voting.results(ref);
  }
}
