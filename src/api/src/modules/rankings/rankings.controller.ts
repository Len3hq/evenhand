import { Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public } from '../../core/auth/decorators.js';
import { sendCsv } from '../../core/csv.js';
import { PublicResultsDto, RankingDto, RankingSummaryDto } from './dto/ranking.dto.js';
import { RankingsService } from './rankings.service.js';

const EVENT = { name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' };

@ApiTags('rankings')
@Controller()
export class RankingsController {
  constructor(private readonly rankings: RankingsService) {}

  /**
   * Rank the event from its submitted reviews: normalised scores with uncertainty, tie groups,
   * a reason per project and hashes of inputs and result. Projects with one review are listed,
   * not ranked. The event's organisers and admins.
   */
  @ApiParam(EVENT)
  @Post('events/:eventRef/rankings')
  run(@CurrentActor() actor: Actor, @Param('eventRef') eventRef: string): Promise<RankingDto> {
    return this.rankings.run(actor, eventRef);
  }

  /** The event's ranking runs, newest first, with whether each still matches the data. */
  @ApiParam(EVENT)
  @Get('events/:eventRef/rankings')
  list(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
  ): Promise<RankingSummaryDto[]> {
    return this.rankings.list(actor, eventRef);
  }

  /** One run with every project: the ranking receipt. */
  @Get('rankings/:runId')
  get(@CurrentActor() actor: Actor, @Param('runId') runId: string): Promise<RankingDto> {
    return this.rankings.get(actor, runId);
  }

  /** Publish a run as the event's results (409 `ranking_stale` if the data changed since). */
  @Post('rankings/:runId/publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentActor() actor: Actor, @Param('runId') runId: string): Promise<RankingDto> {
    return this.rankings.publish(actor, runId);
  }

  /** The published results, with their hashes. Public; 404 until published. */
  @Public()
  @ApiParam(EVENT)
  @Get('events/:eventRef/results')
  results(@Param('eventRef') eventRef: string): Promise<PublicResultsDto> {
    return this.rankings.results(eventRef);
  }

  /** The published ranking (else the newest run) as CSV. Organisers and admins. */
  @ApiParam(EVENT)
  @ApiProduces('text/csv')
  @Get('events/:eventRef/export/results.csv')
  async resultsCsv(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.rankings.resultsCsv(actor, eventRef);
    sendCsv(res, filename, csv);
  }
}
