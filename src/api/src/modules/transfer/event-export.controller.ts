import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor, ExportRateLimit } from '../../core/auth/decorators.js';
import { type EventExportFile, EventExportService } from './event-export.service.js';

@ApiTags('export')
@Controller()
export class EventExportController {
  constructor(private readonly exporter: EventExportService) {}

  /**
   * The whole event in the organisers' fixtures.json shape (readable by any DOGFOOD portal),
   * plus an `evenhand` block with what that shape cannot hold. Submitted projects and final
   * reviews only. Load it into another Evenhand with `cli import <file>`. The event's
   * organisers and admins only.
   */
  @ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
  @ExportRateLimit()
  @Get('events/:eventRef/export.json')
  async export(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EventExportFile> {
    const file = await this.exporter.exportFor(actor, eventRef);
    const name = file.evenhand.event?.slug ?? 'event';
    res.setHeader('Content-Disposition', `attachment; filename="${name}-export.json"`);
    return file;
  }
}
