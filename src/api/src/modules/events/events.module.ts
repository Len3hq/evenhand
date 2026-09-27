import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { PrizesController } from './prizes.controller.js';
import { PrizesService } from './prizes.service.js';
import { TracksController } from './tracks.controller.js';
import { TracksService } from './tracks.service.js';

@Module({
  controllers: [EventsController, TracksController, PrizesController],
  providers: [EventsService, TracksService, PrizesService],
})
export class EventsModule {}
