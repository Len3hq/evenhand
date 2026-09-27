import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, Public } from '../../core/auth/decorators.js';
import {
  CreateEventDto,
  EventDetailDto,
  EventDto,
  EventPageDto,
  EventQueryDto,
  UpdateEventDto,
} from './dto/event.dto.js';
import { EventsService } from './events.service.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** Every event, newest deadline first. Public. */
  @Public()
  @Get()
  list(@Query() query: EventQueryDto): Promise<EventPageDto> {
    return this.events.list(query);
  }

  /**
   * Create an event; you become its organiser. Admins and existing organisers only (403
   * otherwise). The slug is derived from the name unless given; a taken slug is 409.
   */
  @Post()
  create(@CurrentActor() actor: Actor, @Body() dto: CreateEventDto): Promise<EventDto> {
    return this.events.create(actor, dto);
  }

  /** One event with its tracks and prizes. Public. */
  @Public()
  @ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
  @Get(':eventRef')
  get(@Param('eventRef') eventRef: string): Promise<EventDetailDto> {
    return this.events.get(eventRef);
  }

  /** Change the name or dates. Organisers of this event and admins only. */
  @ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
  @Patch(':eventRef')
  update(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: UpdateEventDto,
  ): Promise<EventDto> {
    return this.events.update(actor, eventRef, dto);
  }
}
