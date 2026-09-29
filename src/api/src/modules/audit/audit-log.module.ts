import { Module } from '@nestjs/common';
import { AuditChainService } from './audit-chain.service.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuditLogService } from './audit-log.service.js';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditChainService],
})
export class AuditLogModule {}
