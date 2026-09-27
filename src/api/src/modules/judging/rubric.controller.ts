import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public } from '../../core/auth/decorators.js';
import { RubricDto, RubricInputDto } from './dto/rubric.dto.js';
import { RubricService } from './rubric.service.js';

@ApiTags('judging')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/criteria')
export class RubricController {
  constructor(private readonly rubric: RubricService) {}

  /** The rubric with each criterion's share of the score. Public: teams see how they are judged. */
  @Public()
  @Get()
  get(@Param('eventRef') eventRef: string): Promise<RubricDto> {
    return this.rubric.get(eventRef);
  }

  /**
   * Replace the rubric (1–10 criteria, in display order). The event's organisers and admins.
   * Once reviews are final: labels and weights can change; adding or removing criteria and
   * changing a scored range are refused (409 `rubric_locked`).
   */
  @Put()
  replace(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: RubricInputDto,
  ): Promise<RubricDto> {
    return this.rubric.replace(actor, eventRef, dto);
  }
}
