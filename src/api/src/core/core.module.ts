import { type ExecutionContext, Global, Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE, Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit.service.js';
import { ActorService } from './auth/actor.service.js';
import {
  AUTH_RATE_LIMIT,
  COMMENT_RATE_LIMIT,
  EXPORT_RATE_LIMIT,
  IMAGE_RATE_LIMIT,
  REVIEW_RATE_LIMIT,
  UPLOAD_RATE_LIMIT,
  VOTE_RATE_LIMIT,
} from './auth/decorators.js';
import { RoleGuard } from './auth/role.guard.js';
import { SessionGuard } from './auth/session.guard.js';
import { Clock, SystemClock } from './clock.js';
import { AppConfig } from './config.js';
import { SubmissionsOpenGuard } from './deadline.js';
import { AllExceptionsFilter } from './errors.js';
import { PrismaService } from './prisma.service.js';
import {
  AuditedThrottlerGuard,
  AuthFailureLimiter,
  authTracker,
  rateLimitTracker,
} from './rate-limit.js';

const MINUTE_MS = 60_000;

const reflector = new Reflector();
const marked = (key: string, ctx: ExecutionContext): boolean =>
  reflector.get<boolean>(key, ctx.getHandler()) === true;

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
      // Buckets are per credential, falling back to the address (rateLimitTracker); login and
      // registration are per email (authTracker).
      useFactory: (config: AppConfig) => ({
        getTracker: rateLimitTracker,
        throttlers: [
          {
            name: 'default',
            ttl: MINUTE_MS,
            limit: config.rateLimitDefaultPerMin,
            // Image downloads have their own, larger limit (below).
            skipIf: (ctx) => marked(IMAGE_RATE_LIMIT, ctx),
          },
          {
            name: 'auth',
            ttl: MINUTE_MS,
            limit: config.rateLimitLoginPerMin,
            // Only routes marked @AuthRateLimit() (login, register) count against this one.
            skipIf: (ctx) => !marked(AUTH_RATE_LIMIT, ctx),
            getTracker: authTracker,
          },
          // Exports and judge writes have limits of their own (decision 55).
          {
            name: 'export',
            ttl: MINUTE_MS,
            limit: config.rateLimitExportPerMin,
            skipIf: (ctx) => !marked(EXPORT_RATE_LIMIT, ctx),
            // One counter per caller across every export route, not one per route.
            generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
          },
          {
            name: 'review',
            ttl: MINUTE_MS,
            limit: config.rateLimitReviewPerMin,
            skipIf: (ctx) => !marked(REVIEW_RATE_LIMIT, ctx),
            generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
          },
          {
            name: 'upload',
            ttl: MINUTE_MS,
            limit: config.rateLimitUploadPerMin,
            skipIf: (ctx) => !marked(UPLOAD_RATE_LIMIT, ctx),
            generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
          },
          {
            name: 'comment',
            ttl: MINUTE_MS,
            limit: config.rateLimitCommentPerMin,
            skipIf: (ctx) => !marked(COMMENT_RATE_LIMIT, ctx),
            generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
          },
          {
            name: 'vote',
            ttl: MINUTE_MS,
            limit: config.rateLimitVotePerMin,
            skipIf: (ctx) => !marked(VOTE_RATE_LIMIT, ctx),
            generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
          },
          {
            name: 'image',
            ttl: MINUTE_MS,
            limit: config.rateLimitImagePerMin,
            skipIf: (ctx) => !marked(IMAGE_RATE_LIMIT, ctx),
            generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
          },
        ],
      }),
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
    AuthFailureLimiter,
    { provide: APP_GUARD, useClass: AuditedThrottlerGuard },
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
