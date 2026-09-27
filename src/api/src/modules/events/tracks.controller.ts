import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { EventTrackDto } from './dto/event.dto.js';
import { CreateTrackDto, UpdateTrackDto } from './dto/track-prize.dto.js';
import { TracksService } from './tracks.service.js';

/** Tracks are listed by `GET /events/:eventRef`. Organisers of the event and admins only. */
@ApiTags('events')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/tracks')
export class TracksController {
  constructor(private readonly tracks: TracksService) {}

  /** Add a track. A name already used in this event is 409 `track_name_taken`. */
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: CreateTrackDto,
  ): Promise<EventTrackDto> {
    return this.tracks.create(actor, eventRef, dto);
  }

  /** Rename a track. */
  @ApiParam({ name: 'trackRef', description: 'Track id or fixture id (trk_01).' })
  @Patch(':trackRef')
  rename(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('trackRef') trackRef: string,
    @Body() dto: UpdateTrackDto,
  ): Promise<EventTrackDto> {
    return this.tracks.rename(actor, eventRef, trackRef, dto);
  }

  /** Remove an unused track. One with submissions, prizes or judges is 409 `track_in_use`. */
  @ApiParam({ name: 'trackRef', description: 'Track id or fixture id (trk_01).' })
  @Delete(':trackRef')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('trackRef') trackRef: string,
  ): Promise<void> {
    return this.tracks.remove(actor, eventRef, trackRef);
  }
}
