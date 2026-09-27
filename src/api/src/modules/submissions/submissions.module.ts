import { Module } from '@nestjs/common';
import { SubmissionController } from './submission.controller.js';
import { SubmissionsController } from './submissions.controller.js';
import { SubmissionsService } from './submissions.service.js';

@Module({
  controllers: [SubmissionsController, SubmissionController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
