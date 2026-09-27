import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, RequireRole } from '../../core/auth/decorators.js';
import { JudgeQueueDto, ReviewDto, SaveReviewDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

const ASSIGNMENT = { name: 'assignmentId', description: 'An assignment from your queue.' };

/** The judge console. Judges only, and only ever their own assignments. */
@ApiTags('judging')
@RequireRole('JUDGE')
@Controller('judge')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Your assigned projects in every event you judge, in queue order, with progress. */
  @Get('queue')
  queue(@CurrentActor() actor: Actor): Promise<JudgeQueueDto> {
    return this.reviews.queue(actor);
  }

  /** One of your assignments: the project, the rubric and your review so far. */
  @ApiParam(ASSIGNMENT)
  @Get('reviews/:assignmentId')
  get(@CurrentActor() actor: Actor, @Param('assignmentId') id: string): Promise<ReviewDto> {
    return this.reviews.get(actor, id);
  }

  /**
   * Save your draft (marks may be missing; null clears one). 409 `review_final` once submitted,
   * 403 `judging_closed` after judging closes.
   */
  @ApiParam(ASSIGNMENT)
  @Put('reviews/:assignmentId')
  save(
    @CurrentActor() actor: Actor,
    @Param('assignmentId') id: string,
    @Body() dto: SaveReviewDto,
  ): Promise<ReviewDto> {
    return this.reviews.save(actor, id, dto);
  }

  /** Submit the review: every criterion marked. Final; submitting again changes nothing. */
  @ApiParam(ASSIGNMENT)
  @Post('reviews/:assignmentId/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentActor() actor: Actor, @Param('assignmentId') id: string): Promise<ReviewDto> {
    return this.reviews.submit(actor, id);
  }
}
