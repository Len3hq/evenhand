import { Module } from '@nestjs/common';
import { JudgingController } from './judging.controller.js';
import { JudgingService } from './judging.service.js';
import { RubricController } from './rubric.controller.js';
import { RubricService } from './rubric.service.js';

@Module({
  controllers: [JudgingController, RubricController],
  providers: [JudgingService, RubricService],
})
export class JudgingModule {}
