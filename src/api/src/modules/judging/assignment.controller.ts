import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { AssignmentRunDto, RunAssignmentDto } from './dto/assignment.dto.js';
import { AssignmentService } from './assignment.service.js';

@ApiTags('judging')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/assignments')
export class AssignmentController {
  constructor(private readonly assignments: AssignmentService) {}

  /**
   * Top every judged project up to `target` reviews (default 3): track-matched, never a
   * conflict of interest, least-loaded judge first, seeded random tie-breaks. Existing work is
   * kept. Reports projects that cannot reach the target. The event's organisers and admins.
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: RunAssignmentDto,
  ): Promise<AssignmentRunDto> {
    return this.assignments.run(actor, eventRef, dto);
  }
}
