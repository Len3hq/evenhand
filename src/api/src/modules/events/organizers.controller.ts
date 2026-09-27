import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { AddOrganizerDto, OrganizerDto } from './dto/organizer.dto.js';
import { OrganizersService } from './organizers.service.js';

/** The people who run an event. Its organisers and admins only. */
@ApiTags('events')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/organizers')
export class OrganizersController {
  constructor(private readonly organizers: OrganizersService) {}

  @Get()
  list(@CurrentActor() actor: Actor, @Param('eventRef') eventRef: string): Promise<OrganizerDto[]> {
    return this.organizers.list(actor, eventRef);
  }

  /**
   * Make an existing account an organiser (404 if no account uses the email). Refused for
   * someone on a team in the event or judging it (409 `conflict_of_interest`).
   */
  @Post()
  add(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: AddOrganizerDto,
  ): Promise<OrganizerDto> {
    return this.organizers.add(actor, eventRef, dto);
  }

  /** Remove an organiser, yourself included; never the last one (409 `last_organizer`). */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.organizers.remove(actor, eventRef, userId);
  }
}
