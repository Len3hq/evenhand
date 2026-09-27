import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../../core/auth/actor.js';
import { CurrentActor } from '../../core/auth/decorators.js';
import { sendCsv } from '../../core/csv.js';
import { AuditLogService } from './audit-log.service.js';
import { AuditPageDto, AuditQueryDto, PlatformAuditPageDto } from './dto/audit.dto.js';

@ApiTags('audit')
@Controller()
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  /**
   * Everything that happened in an event, newest first, each entry with a readable summary.
   * Filter by `action` (`event.updated`, or a group like `submission.`), `actor` (email or id)
   * and `target` (a row id). The event's organisers and admins only.
   */
  @ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
  @Get('events/:eventRef/audit')
  forEvent(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Query() query: AuditQueryDto,
  ): Promise<AuditPageDto> {
    return this.audit.forEvent(actor, eventRef, query);
  }

  /** The event's whole trail, oldest first, as CSV. The event's organisers and admins only. */
  @ApiParam({ name: 'eventRef', description: 'Event id, fixture id (evt_01) or slug.' })
  @ApiProduces('text/csv')
  @Get('events/:eventRef/export/audit.csv')
  async eventCsv(
    @CurrentActor() actor: Actor,
    @Param('eventRef') eventRef: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, csv } = await this.audit.eventCsv(actor, eventRef);
    sendCsv(res, filename, csv);
  }

  /** Entries outside any event (logins, accounts, admin grants), with client addresses. Admins only. */
  @Get('audit')
  platform(
    @CurrentActor() actor: Actor,
    @Query() query: AuditQueryDto,
  ): Promise<PlatformAuditPageDto> {
    return this.audit.platform(actor, query);
  }
}
