import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { EventRoleKind } from '../../generated/prisma/client.js';
import { forbidden } from '../errors.js';
import { REQUIRED_ROLES } from './decorators.js';

/**
 * Global guard, runs after SessionGuard. Enforces @RequireRole(...): the caller must hold one
 * of the roles in at least one event, or be an admin. Wrong role → 403, before any handler
 * or database lookup for the requested resource.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<EventRoleKind[] | undefined>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const actor = context.switchToHttp().getRequest<Request>().actor;
    if (actor && (actor.isAdmin || actor.hasRoleAnywhere(...roles))) return true;
    throw forbidden();
  }
}
