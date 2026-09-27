import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuditService } from './audit.service.js';
import { Clock } from './clock.js';
import { AppConfig } from './config.js';
import { DomainError } from './errors.js';
import { PrismaService } from './prisma.service.js';

const MINUTE_MS = 60_000;

/**
 * Remembers what already happened in the current minute, per key, so a flood of refused
 * requests writes one audit row, not one per request.
 */
class OncePerMinute {
  private readonly seen = new Map<string, number>();

  first(key: string, now: number): boolean {
    const at = this.seen.get(key);
    if (at !== undefined && now - at < MINUTE_MS) return false;
    this.seen.set(key, now);
    if (this.seen.size > 10_000) {
      for (const [k, t] of this.seen) if (now - t >= MINUTE_MS) this.seen.delete(k);
    }
    return true;
  }
}

/**
 * The global rate limiter, audited: when a limit refuses a request (429), the audit trail gets
 * one `request.rate_limited` row per address and limit per minute, with the address (visible to admins
 * only, in the platform trail).
 */
@Injectable()
export class AuditedThrottlerGuard extends ThrottlerGuard {
  @Inject(AuditService) private readonly audit!: AuditService;
  @Inject(PrismaService) private readonly prisma!: PrismaService;
  @Inject(Clock) private readonly clock!: Clock;
  private readonly recorded = new OncePerMinute();
  private readonly log = new Logger('RateLimit');

  protected override async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(props);
    } catch (e) {
      const req = props.context.switchToHttp().getRequest<Request>();
      const name = props.throttler.name ?? 'default';
      if (this.recorded.first(`${req.ip}|${name}`, this.clock.now().getTime())) {
        await recordRefusal(this.audit, this.prisma, this.log, req, name, props.limit);
      }
      throw e;
    }
  }
}

/**
 * Failed credential checks per address. After `authFailuresPerMin` failures in a minute the
 * address is refused (429) for the rest of that minute, valid credentials included: answering
 * a correct guess differently would tell the guesser it was correct.
 */
@Injectable()
export class AuthFailureLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly recorded = new OncePerMinute();
  private readonly log = new Logger('RateLimit');

  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /** Throws 429 if this address has used up its failures for the current minute. */
  async assertAllowed(req: Request): Promise<void> {
    const w = this.window(req.ip ?? 'unknown');
    if (w.count < this.config.authFailuresPerMin) return;
    if (this.recorded.first(`${req.ip}|auth-failures`, this.clock.now().getTime())) {
      await recordRefusal(
        this.audit,
        this.prisma,
        this.log,
        req,
        'auth-failures',
        this.config.authFailuresPerMin,
      );
    }
    throw new DomainError(
      HttpStatus.TOO_MANY_REQUESTS,
      'rate_limited',
      'Too many failed sign-in attempts from this address. Try again in a minute.',
    );
  }

  recordFailure(req: Request): void {
    this.window(req.ip ?? 'unknown').count++;
  }

  private window(ip: string): { start: number; count: number } {
    const now = this.clock.now().getTime();
    let w = this.windows.get(ip);
    if (!w || now - w.start >= MINUTE_MS) {
      w = { start: now, count: 0 };
      this.windows.set(ip, w);
      if (this.windows.size > 10_000) {
        for (const [k, v] of this.windows) if (now - v.start >= MINUTE_MS) this.windows.delete(k);
      }
    }
    return w;
  }
}

async function recordRefusal(
  audit: AuditService,
  prisma: PrismaService,
  log: Logger,
  req: Request,
  limit: string,
  perMinute: number,
): Promise<void> {
  try {
    await audit.record(prisma, {
      actorId: req.actor?.userId ?? null,
      action: 'request.rate_limited',
      targetType: 'request',
      after: { limit, perMinute, method: req.method, path: req.path },
      ip: req.ip ?? null,
    });
  } catch (err) {
    // Never let auditing a refusal turn a 429 into a 500.
    log.error(`could not audit a rate-limit refusal: ${String(err)}`);
  }
}
