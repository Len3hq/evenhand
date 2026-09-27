import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { EventPrizeDto } from './dto/event.dto.js';
import { CreatePrizeDto, UpdatePrizeDto } from './dto/track-prize.dto.js';
import { PrizesService } from './prizes.service.js';

/** Prizes are listed by `GET /events/:eventRef`. Organisers of the event and admins only. */
@ApiTags('events')
@ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
@Controller('events/:eventRef/prizes')
export class PrizesController {
  constructor(private readonly prizes: PrizesService) {}

  /** Add a prize: overall, or for one track of this event. */
  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Body() dto: CreatePrizeDto,
  ): Promise<EventPrizeDto> {
    return this.prizes.create(actor, eventRef, dto);
  }

  /** Change a prize's name, description or track. */
  @Patch(':prizeId')
  update(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('prizeId') prizeId: string,
    @Body() dto: UpdatePrizeDto,
  ): Promise<EventPrizeDto> {
    return this.prizes.update(actor, eventRef, prizeId, dto);
  }

  @Delete(':prizeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Param('prizeId') prizeId: string,
  ): Promise<void> {
    return this.prizes.remove(actor, eventRef, prizeId);
  }
}
