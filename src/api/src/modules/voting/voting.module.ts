import { Module } from '@nestjs/common';
import { VotingController } from './voting.controller.js';
import { VotingService } from './voting.service.js';

@Module({ controllers: [VotingController], providers: [VotingService] })
export class VotingModule {}
