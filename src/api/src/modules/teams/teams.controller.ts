import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public } from '../../core/auth/decorators.js';
import { SubmissionsOpenGuard } from '../../core/deadline.js';
import { CreateTeamDto, InviteDto, InvitePreviewDto, TeamDto } from './dto/team.dto.js';
import { TeamsService } from './teams.service.js';

@ApiTags('teams')
@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  /**
   * Create a team in an event; you become its first member. Only while the event accepts
   * submissions (403 `submissions_closed` / `submissions_not_open`). One team per person per
   * event (409 `already_on_team`); team names are unique per event (409 `team_name_taken`).
   */
  @ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
  @UseGuards(SubmissionsOpenGuard)
  @Post('events/:eventRef/teams')
  create(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamDto> {
    // SubmissionsOpenGuard has resolved and checked the event.
    return this.teams.create(actor, req.event!, dto);
  }

  /** A team and its members. Its members, the event's organisers and admins only. */
  @ApiParam({ name: 'teamRef', description: 'Team id or fixture id (tm_01).' })
  @Get('teams/:teamRef')
  get(@CurrentActor() actor: Actor, @Param('teamRef') teamRef: string): Promise<TeamDto> {
    return this.teams.get(actor, teamRef);
  }

  /** A new invite link (7 days, 4 uses). Members of the team only, while the event is open. */
  @ApiParam({ name: 'teamRef', description: 'Team id or fixture id (tm_01).' })
  @Post('teams/:teamRef/invites')
  createInvite(
    @CurrentActor() actor: Actor,
    @Param('teamRef') teamRef: string,
  ): Promise<InviteDto> {
    return this.teams.createInvite(actor, teamRef);
  }

  /** What an invite link is for. Public, and does not use the invite. 410 when expired or used up. */
  @Public()
  @Get('invites/:token')
  preview(@Param('token') token: string): Promise<InvitePreviewDto> {
    return this.teams.preview(token);
  }

  /** Join the invite's team. */
  @Post('invites/:token')
  join(@CurrentActor() actor: Actor, @Param('token') token: string): Promise<TeamDto> {
    return this.teams.join(actor, token);
  }
}
