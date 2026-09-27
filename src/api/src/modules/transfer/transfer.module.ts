import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module.js';
import { EventExportController } from './event-export.controller.js';
import { EventExportService } from './event-export.service.js';

/** Moving events in and out: export here, import through the seed importer (cli import). */
@Module({
  imports: [CoreModule],
  controllers: [EventExportController],
  providers: [EventExportService],
  exports: [EventExportService],
})
export class TransferModule {}
