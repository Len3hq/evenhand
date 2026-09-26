import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { SubmissionsOpenGuard } from '../../core/deadline.js';
import { CreateSubmissionDto, SubmissionDto } from './dto/submission.dto.js';
import { SubmissionsService } from './submissions.service.js';

@ApiTags('submissions')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  /**
   * Create your team's draft. Refused with 403 `submissions_closed` once the event's
   * deadline has passed, before the body is validated (acceptance check 3).
   */
  @UseGuards(SubmissionsOpenGuard)
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Body() dto: CreateSubmissionDto,
  ): Promise<SubmissionDto> {
    // SubmissionsOpenGuard has resolved and checked the event.
    return this.submissions.create(actor, req.event!, dto);
  }
}
