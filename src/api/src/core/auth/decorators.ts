import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { EventRoleKind } from '../../generated/prisma/client.js';
import type { Actor } from './actor.js';

export const IS_PUBLIC = 'evenhand:isPublic';
export const REQUIRED_ROLES = 'evenhand:requiredRoles';
export const AUTH_RATE_LIMIT = 'evenhand:authRateLimit';

/** Anyone may call this route, logged in or not. The actor is still resolved if present. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * The caller must hold one of these roles in at least one event (or be an admin).
 * This is the coarse gate; services still check the role *for the specific event*.
 */
export const RequireRole = (...roles: EventRoleKind[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);

/** Apply the stricter per-IP "auth" rate limit (login, register) to this route. */
export const AuthRateLimit = (): MethodDecorator => SetMetadata(AUTH_RATE_LIMIT, true);

/** The authenticated caller. Only use on routes that are not @Public(). */
export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const actor = ctx.switchToHttp().getRequest<Request>().actor;
  if (!actor) {
    // SessionGuard guarantees an actor on non-public routes; reaching here is a wiring bug.
    throw new Error('CurrentActor used on a route without an authenticated actor');
  }
  return actor;
});

/** The caller if logged in, otherwise undefined. For @Public() routes. */
export const OptionalActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Actor | undefined =>
    ctx.switchToHttp().getRequest<Request>().actor,
);
