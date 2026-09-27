import { Module } from '@nestjs/common';
import { AssignmentController } from './assignment.controller.js';
import { AssignmentService } from './assignment.service.js';
import { JudgingController } from './judging.controller.js';
import { JudgingService } from './judging.service.js';
import { RubricController } from './rubric.controller.js';
import { RubricService } from './rubric.service.js';

@Module({
  controllers: [JudgingController, RubricController, AssignmentController],
  providers: [JudgingService, RubricService, AssignmentService],
})
export class JudgingModule {}
