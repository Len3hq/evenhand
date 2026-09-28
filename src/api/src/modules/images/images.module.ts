import { Module } from '@nestjs/common';
import { EditableSubmissionGuard } from './editable-submission.guard.js';
import { ImagesController } from './images.controller.js';
import { ImagesService } from './images.service.js';

@Module({
  controllers: [ImagesController],
  providers: [ImagesService, EditableSubmissionGuard],
})
export class ImagesModule {}
