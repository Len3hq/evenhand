import { Module } from '@nestjs/common';
import { DuplicatesService } from './duplicates.service.js';
import { EligibilityService } from './eligibility.service.js';
import { IntegrityController } from './integrity.controller.js';

@Module({
  controllers: [IntegrityController],
  providers: [DuplicatesService, EligibilityService],
})
export class IntegrityModule {}
