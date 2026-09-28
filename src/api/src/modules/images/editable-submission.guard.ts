import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Clock } from '../../core/clock.js';
import { assertSubmissionsOpen } from '../../core/deadline.js';
import { DomainError, forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import { byRef } from '../../core/refs.js';

/**
 * Permission and deadline for writes to a submission's images, decided before the upload is
 * read: Nest runs guards before interceptors, and the file is parsed by an interceptor. So a
 * stranger, or a team after the deadline, is refused without the portal accepting a byte.
 *
 * The same three rules as editing the submission (SubmissionsService.editable): the caller is on
 * its team (one query that asks "is this mine?", so a non-member learns nothing about whether
 * it exists), submissions are open, and it is not a held or replaced duplicate copy.
 */
@Injectable()
export class EditableSubmissionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const actor = req.actor;
    const ref = req.params.ref;
    const submission =
      actor && typeof ref === 'string' && ref
        ? await this.prisma.submission.findFirst({
            where: { ...byRef(ref), team: { members: { some: { userId: actor.userId } } } },
            include: { event: true },
          })
        : null;
    if (!submission) throw forbidden('Only members of the team can change its submission.');
    assertSubmissionsOpen(submission.event, this.clock.now());
    if (submission.supersededById || submission.duplicateHold) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'submission_superseded',
        "This copy was replaced by the team's newer submission; edit that one.",
      );
    }
    req.submission = submission;
    return true;
  }
}
