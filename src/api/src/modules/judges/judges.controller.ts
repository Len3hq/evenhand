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
} from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public } from '../../core/auth/decorators.js';
import {
  CreateJudgeInviteDto,
  JoinedAsJudgeDto,
  JudgeDto,
  JudgeInviteDto,
  JudgeInvitePreviewDto,
  JudgeTracksDto,
} from './dto/judges.dto.js';
import { JudgesService } from './judges.service.js';

const EVENT = { name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' };
const JUDGE = { name: 'judgeRef', description: 'Judge id or fixture id (jdg_24).' };

@ApiTags('judges')
@Controller()
export class JudgesController {
  constructor(private readonly judges: JudgesService) {}

  /**
   * A judge invite link for chosen tracks (1 use by default, up to 50 for a panel; 7 days by
   * default). The token is in this response only. The event's organisers and admins.
   */
  @ApiParam(EVENT)
  @Post('events/:eventRef/judge-invites')
  createInvite(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: CreateJudgeInviteDto,
  ): Promise<JudgeInviteDto> {
    return this.judges.createInvite(actor, eventRef, dto);
  }

  /** What a judge invite is for. Public; does not use it. 410 when expired or used up. */
  @Public()
  @Get('judge-invites/:token')
  preview(@Param('token') token: string): Promise<JudgeInvitePreviewDto> {
    return this.judges.preview(token);
  }

  /**
   * Become a judge of the event. Refused for anyone on a team in it or organising it
   * (409 `conflict_of_interest`), existing judges (409) and after judging closes (403).
   */
  @Post('judge-invites/:token')
  accept(@CurrentActor() actor: Actor, @Param('token') token: string): Promise<JoinedAsJudgeDto> {
    return this.judges.accept(actor, token);
  }

  /** The event's judges with their tracks and progress. Its organisers and admins. */
  @ApiParam(EVENT)
  @Get('events/:eventRef/judges')
  list(@CurrentActor() actor: Actor, @Param('eventRef') eventRef: string): Promise<JudgeDto[]> {
    return this.judges.list(actor, eventRef);
  }

  /** Change the tracks a judge covers. */
  @ApiParam(EVENT)
  @ApiParam(JUDGE)
  @Put('events/:eventRef/judges/:judgeRef/tracks')
  setTracks(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('judgeRef') judgeRef: string,
    @Body() dto: JudgeTracksDto,
  ): Promise<JudgeDto> {
    return this.judges.setTracks(actor, eventRef, judgeRef, dto);
  }

  /** Remove a judge who has not reviewed anything (409 `judge_has_reviews` otherwise). */
  @ApiParam(EVENT)
  @ApiParam(JUDGE)
  @Delete('events/:eventRef/judges/:judgeRef')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('judgeRef') judgeRef: string,
  ): Promise<void> {
    return this.judges.remove(actor, eventRef, judgeRef);
  }
}
