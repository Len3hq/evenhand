import { Controller, Get, Param } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { ProgressDto } from './dto/progress.dto.js';
import { ProgressService } from './progress.service.js';

@ApiTags('judging')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  /**
   * Judging progress per judge and per project, with judges who gave every project exactly the
   * same marks flagged. The event's organisers and admins; the dashboard polls it.
   */
  @Get()
  get(@CurrentActor() actor: Actor, @Param('eventRef') eventRef: string): Promise<ProgressDto> {
    return this.progress.forEvent(actor, eventRef);
  }
}
