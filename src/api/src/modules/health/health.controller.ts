import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../core/auth/decorators.js';
import { DomainError } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';

@ApiTags('health')
@Controller('healthz')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness and database readiness. Used by the compose healthcheck. */
  @Public()
  @SkipThrottle()
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new DomainError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'internal_error',
        'Database unavailable.',
      );
    }
    return { status: 'ok' };
  }
}
