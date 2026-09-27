import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, ExportRateLimit, RequireRole } from '../../core/auth/decorators.js';
import { sendCsv } from '../../core/csv.js';
import { ScoreListDto } from './dto/scores.dto.js';
import { JudgingService } from './judging.service.js';

@ApiTags('judging')
@Controller()
export class JudgingController {
  constructor(private readonly judging: JudgingService) {}

  /** Your own scores. Judges only: participants get 403 (acceptance checks 4 and 6). */
  @RequireRole('JUDGE')
  @Get('judge/scores')
  ownScores(@CurrentActor() actor: Actor): Promise<ScoreListDto> {
    return this.judging.ownScores(actor);
  }

  /**
   * One judge's scores, by internal id or fixture id (e.g. jdg_24). Only that judge, the
   * event's organisers and admins may read them; any other judge gets 403 (acceptance check 5).
   */
  @Get('judges/:judgeRef/scores')
  judgeScores(
    @CurrentActor() actor: Actor,
    @Param('judgeRef') judgeRef: string,
  ): Promise<ScoreListDto> {
    return this.judging.judgeScores(actor, judgeRef);
  }

  /** Every review in the event as CSV. Organisers and admins only (acceptance check 7). */
  @RequireRole('ORGANIZER')
  @ApiProduces('text/csv')
  @ExportRateLimit()
  @Get('events/:eventRef/export/scores.csv')
  async exportScores(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.judging.exportScoresCsv(actor, eventRef);
    sendCsv(res, filename, csv);
  }
}
