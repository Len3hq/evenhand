import type { Event } from '../../generated/prisma/client.js';
import type { Actor } from './actor.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by SessionGuard when the request is authenticated. */
    actor?: Actor;
    /** Set by SubmissionsOpenGuard: the event named by the route's :eventRef. */
    event?: Event;
  }
}
