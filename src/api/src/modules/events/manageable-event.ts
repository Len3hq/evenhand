import { HttpStatus } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { DomainError, forbidden } from '../../core/errors.js';
import type { PrismaService } from '../../core/prisma.service.js';
import { eventByRef } from '../../core/refs.js';
import type { Event } from '../../generated/prisma/client.js';

/**
 * The event `ref` names, if the caller may manage it (its organisers and admins).
 *
 * Deny first: a caller who organises nothing is refused before the event is looked up, so
 * the answer is the same 403 whether or not the event exists. Organisers of *other* events
 * learn that it exists (404 vs 403), which the public event list tells them anyway.
 */
export async function manageableEvent(
  prisma: PrismaService,
  actor: Actor,
  ref: string,
): Promise<Event> {
  if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
  const event = await prisma.event.findFirst({ where: eventByRef(ref) });
  if (!event) throw new DomainError(HttpStatus.NOT_FOUND, 'not_found', 'No such event.');
  if (!actor.canManageEvent(event.id)) throw forbidden();
  return event;
}
