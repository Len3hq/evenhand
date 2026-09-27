import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { SubmissionDto, UpdateSubmissionDto } from './dto/submission.dto.js';
import { SubmissionsService } from './submissions.service.js';

/** One submission, addressed by id. Creating one is `POST /events/:eventRef/submissions`. */
@ApiTags('submissions')
@ApiParam({ name: 'ref', description: 'Submission id or fixture id (prj_01).' })
@Controller('submissions/:ref')
export class SubmissionController {
  constructor(private readonly submissions: SubmissionsService) {}

  /** Draft or submitted: for its team, the event's organisers and admins (403 otherwise). */
  @Get()
  get(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<SubmissionDto> {
    return this.submissions.get(actor, ref);
  }

  /**
   * Edit any field. Team members only, until the deadline, also after submitting
   * (403 `submissions_closed` after it).
   */
  @Patch()
  update(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Body() dto: UpdateSubmissionDto,
  ): Promise<SubmissionDto> {
    return this.submissions.update(actor, ref, dto);
  }

  /** Submit the draft (needs a title and a summary); it then appears in the public gallery. */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<SubmissionDto> {
    return this.submissions.submit(actor, ref);
  }
}
