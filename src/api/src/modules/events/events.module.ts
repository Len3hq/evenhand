import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { OrganizersController } from './organizers.controller.js';
import { OrganizersService } from './organizers.service.js';
import { PrizesController } from './prizes.controller.js';
import { PrizesService } from './prizes.service.js';
import { QuestionsController } from './questions.controller.js';
import { QuestionsService } from './questions.service.js';
import { TracksController } from './tracks.controller.js';
import { TracksService } from './tracks.service.js';

@Module({
  controllers: [
    EventsController,
    TracksController,
    PrizesController,
    QuestionsController,
    OrganizersController,
  ],
  providers: [EventsService, TracksService, PrizesService, QuestionsService, OrganizersService],
})
export class EventsModule {}
