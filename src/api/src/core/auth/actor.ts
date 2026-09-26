import type { EventRoleKind } from '../../generated/prisma/client.js';

export interface RoleGrant {
  /** EventRole id. For judges this is also their internal judge id. */
  id: string;
  eventId: string;
  role: EventRoleKind;
  /** Fixture id, e.g. `jdg_24`, for imported judges. */
  externalId: string | null;
}

/**
 * Who is making the request, resolved once per request by SessionGuard. Services receive it
 * as their first argument and make every permission decision from it, *before* touching the
 * database for the thing being asked about (deny first, BUILD-PLAN decision 34).
 */
export class Actor {
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
    readonly isAdmin: boolean,
    /** How the request authenticated. Cookie sessions get the Origin (CSRF) check; bearer tokens do not. */
    readonly via: 'session' | 'bearer',
    readonly grants: readonly RoleGrant[],
  ) {}

  hasRole(eventId: string, role: EventRoleKind): boolean {
    return this.grants.some((g) => g.eventId === eventId && g.role === role);
  }

  hasRoleAnywhere(...roles: EventRoleKind[]): boolean {
    return this.grants.some((g) => roles.includes(g.role));
  }

  /** Organisers see everything in their own events; admins see everything everywhere. */
  canManageEvent(eventId: string): boolean {
    return this.isAdmin || this.hasRole(eventId, 'ORGANIZER');
  }

  get judgeGrants(): readonly RoleGrant[] {
    return this.grants.filter((g) => g.role === 'JUDGE');
  }

  /** True if `ref` (internal id or fixture id) names one of this actor's own judge roles. */
  ownsJudgeRef(ref: string): boolean {
    return this.judgeGrants.some((g) => g.id === ref || g.externalId === ref);
  }
}
