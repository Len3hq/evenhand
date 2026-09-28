import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public } from '../../core/auth/decorators.js';
import { QuestionsDto, QuestionsInputDto } from './dto/question.dto.js';
import { QuestionsService } from './questions.service.js';

@ApiTags('events')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  /** The questions every submission answers, in order. Public: teams see what they are asked. */
  @Public()
  @Get()
  get(@Param('eventRef') eventRef: string): Promise<QuestionsDto> {
    return this.questions.get(eventRef);
  }

  /**
   * Replace the questions (0–20, in display order). The event's organisers and admins. Rows
   * with an `id` keep that question and its answers; rows without one are new. Once teams have
   * answered or submitted, removing an answered question, making an answered private question
   * public, and requiring a question a submitted entry left empty are refused (409
   * `questions_locked`).
   */
  @Put()
  replace(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: QuestionsInputDto,
  ): Promise<QuestionsDto> {
    return this.questions.replace(actor, eventRef, dto);
  }
}
