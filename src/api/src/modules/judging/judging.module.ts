import { Module } from '@nestjs/common';
import { JudgingController } from './judging.controller.js';
import { JudgingService } from './judging.service.js';

@Module({ controllers: [JudgingController], providers: [JudgingService] })
export class JudgingModule {}
