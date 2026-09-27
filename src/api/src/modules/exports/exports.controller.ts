import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, ExportRateLimit } from '../../core/auth/decorators.js';
import { sendCsv } from '../../core/csv.js';
import { type CsvFile, ExportsService } from './exports.service.js';

/** CSV exports for every stage of an event. Its organisers and admins. */
@ApiTags('export')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@ApiProduces('text/csv')
@Controller('events/:eventRef/export')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  /** One row per team member (teams without members get one empty row). */
  @ExportRateLimit()
  @Get('teams.csv')
  teams(@CurrentActor() a: Actor, @Param('eventRef') e: string, @Res() res: Response) {
    return send(res, this.exports.teams(a, e));
  }

  /** Every submission: status, eligibility, links, duplicate state. */
  @ExportRateLimit()
  @Get('submissions.csv')
  submissions(@CurrentActor() a: Actor, @Param('eventRef') e: string, @Res() res: Response) {
    return send(res, this.exports.submissions(a, e));
  }

  /** Who reviews what: batch, queue position and state. */
  @ExportRateLimit()
  @Get('assignments.csv')
  assignments(@CurrentActor() a: Actor, @Param('eventRef') e: string, @Res() res: Response) {
    return send(res, this.exports.assignments(a, e));
  }
}

async function send(res: Response, file: Promise<CsvFile>): Promise<void> {
  const { filename, csv } = await file;
  sendCsv(res, filename, csv);
}
