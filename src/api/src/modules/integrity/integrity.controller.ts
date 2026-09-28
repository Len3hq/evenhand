import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { DisqualifyDto, DuplicateDto, EntryDto } from './dto/integrity.dto.js';
import { DuplicatesService } from './duplicates.service.js';
import { EligibilityService } from './eligibility.service.js';

const EVENT = { name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' };
const SUBMISSION = { name: 'ref', description: 'Submission id or fixture id (prj_07).' };

/** The organisers' integrity decisions: suspected duplicates and eligibility. */
@ApiTags('integrity')
@Controller()
export class IntegrityController {
  constructor(
    private readonly duplicates: DuplicatesService,
    private readonly eligibility: EligibilityService,
  ) {}

  /** Every submitted entry with where it stands (in judging, held, replaced, disqualified). */
  @ApiParam(EVENT)
  @Get('events/:eventRef/submissions')
  entries(@CurrentActor() actor: Actor, @Param('eventRef') eventRef: string): Promise<EntryDto[]> {
    return this.eligibility.list(actor, eventRef);
  }

  /** Suspected duplicates, with what confirming would do (or did) to their reviews. */
  @ApiParam(EVENT)
  @Get('events/:eventRef/duplicates')
  list(@CurrentActor() actor: Actor, @Param('eventRef') eventRef: string): Promise<DuplicateDto[]> {
    return this.duplicates.list(actor, eventRef);
  }

  /**
   * Keep the newer entry: the older one is replaced, its unique reviews move across and the
   * reviews of judges who scored both are set aside. 409 `duplicate_decided` when not pending,
   * `duplicate_chain` when an entry is part of another confirmed duplicate.
   */
  @Post('duplicates/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<DuplicateDto> {
    return this.duplicates.confirm(actor, id);
  }

  /** Not a duplicate: both entries stay. 409 `duplicate_same_team` for one team's two entries. */
  @Post('duplicates/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<DuplicateDto> {
    return this.duplicates.dismiss(actor, id);
  }

  /** Undo a confirmation or dismissal exactly; the duplicate is pending again. */
  @Post('duplicates/:id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@CurrentActor() actor: Actor, @Param('id') id: string): Promise<DuplicateDto> {
    return this.duplicates.reopen(actor, id);
  }

  /** Take a submitted entry out of the gallery, judging and rankings, with a reason for the team. */
  @ApiParam(SUBMISSION)
  @Post('submissions/:ref/disqualify')
  @HttpCode(HttpStatus.OK)
  disqualify(
    @CurrentActor() actor: Actor,
    @Param('ref') ref: string,
    @Body() dto: DisqualifyDto,
  ): Promise<EntryDto> {
    return this.eligibility.disqualify(actor, ref, dto);
  }

  /** Undo a disqualification. */
  @ApiParam(SUBMISSION)
  @Post('submissions/:ref/reinstate')
  @HttpCode(HttpStatus.OK)
  reinstate(@CurrentActor() actor: Actor, @Param('ref') ref: string): Promise<EntryDto> {
    return this.eligibility.reinstate(actor, ref);
  }
}
