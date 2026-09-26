import { Global, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE, Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit.service.js';
import { ActorService } from './auth/actor.service.js';
import { AUTH_RATE_LIMIT } from './auth/decorators.js';
import { RoleGuard } from './auth/role.guard.js';
import { SessionGuard } from './auth/session.guard.js';
import { Clock, SystemClock } from './clock.js';
import { AppConfig } from './config.js';
import { SubmissionsOpenGuard } from './deadline.js';
import { AllExceptionsFilter } from './errors.js';
import { PrismaService } from './prisma.service.js';

const MINUTE_MS = 60_000;

/**
 * Cross-cutting infrastructure, available everywhere without importing:
 * config, clock, Prisma, audit, and the global guards / filter / validation pipe.
 *
 * Global guard order matters: rate limit → authenticate → role check. Route guards
 * (e.g. SubmissionsOpenGuard) run after these; pipes (validation) run after all guards.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: (config: AppConfig) => [
        { name: 'default', ttl: MINUTE_MS, limit: config.rateLimitDefaultPerMin },
        {
          name: 'auth',
          ttl: MINUTE_MS,
          limit: config.rateLimitLoginPerMin,
          // Only routes marked @AuthRateLimit() (login, register) count against this one.
          skipIf: (ctx) => !new Reflector().get<boolean>(AUTH_RATE_LIMIT, ctx.getHandler()),
        },
      ],
      inject: [AppConfig],
    }),
  ],
  providers: [
    { provide: AppConfig, useFactory: () => AppConfig.fromEnv() },
    { provide: Clock, useClass: SystemClock },
    PrismaService,
    AuditService,
    ActorService,
    SubmissionsOpenGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
  exports: [AppConfig, Clock, PrismaService, AuditService, ActorService, SubmissionsOpenGuard],
})
export class CoreModule {}
