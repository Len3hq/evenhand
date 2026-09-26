import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Event } from '../generated/prisma/client.js';
import { Clock } from './clock.js';
import { DomainError } from './errors.js';
import { PrismaService } from './prisma.service.js';
import { eventByRef } from './refs.js';

/**
 * The deadline rule (BUILD-PLAN decisions 30, 48): a submission write is accepted only while
 * `now < submissions_close`, using the server clock in UTC. Never trust a client's time.
 */
export function assertSubmissionsOpen(event: Pick<Event, 'submissionsClose'>, now: Date): void {
  if (now.getTime() >= event.submissionsClose.getTime()) {
    throw new DomainError(
      HttpStatus.FORBIDDEN,
      'submissions_closed',
      `Submissions closed at ${event.submissionsClose.toISOString()}.`,
    );
  }
}

/**
 * Route guard for every submission write under /events/:eventRef/…
 *
 * Nest runs guards before pipes, so a closed event answers 403 `submissions_closed` before the
 * request body is even validated. Services call assertSubmissionsOpen again for writes that
 * are not addressed by event (defence in depth).
 */
@Injectable()
export class SubmissionsOpenGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const ref = req.params.eventRef;
    const event =
      typeof ref === 'string' && ref
        ? await this.prisma.event.findFirst({ where: eventByRef(ref) })
        : null;
    if (!event) {
      throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such event.');
    }
    assertSubmissionsOpen(event, this.clock.now());
    req.event = event;
    return true;
  }
}
