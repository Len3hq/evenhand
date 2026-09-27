import { Module } from '@nestjs/common';
import { JudgesController } from './judges.controller.js';
import { JudgesService } from './judges.service.js';

@Module({ controllers: [JudgesController], providers: [JudgesService] })
export class JudgesModule {}
