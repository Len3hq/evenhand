import { Module } from '@nestjs/common';
import { AssignmentController } from './assignment.controller.js';
import { AssignmentService } from './assignment.service.js';
import { JudgingController } from './judging.controller.js';
import { JudgingService } from './judging.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';
import { RubricController } from './rubric.controller.js';
import { RubricService } from './rubric.service.js';

@Module({
  controllers: [JudgingController, RubricController, AssignmentController, ReviewsController],
  providers: [JudgingService, RubricService, AssignmentService, ReviewsService],
})
export class JudgingModule {}
