import 'server-only';
import { redirect } from 'next/navigation';
import { ApiError, apiGet } from './api/server';
import type { Schemas } from './api/types';

type Me = Schemas['MeDto'];

/**
 * The logged-in user, or a redirect to the login page that comes back to `returnTo`.
 * This only decides what the page shows; every permission is enforced by the API.
 */
export async function requireLogin(returnTo: string): Promise<Me> {
  let me: Me | null = null;
  try {
    me = await apiGet<Me>('/api/auth/me');
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) throw e;
  }
  // redirect() throws, so it stays outside the try block.
  if (!me) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return me;
}

/** The events this user may manage: all of them for an admin, else those they organise. */
export async function managedEvents(me: Me): Promise<Schemas['EventDto'][]> {
  const page = await apiGet<Schemas['EventPageDto']>('/api/events?pageSize=100');
  if (me.isAdmin) return page.items;
  const mine = new Set(me.roles.filter((r) => r.role === 'ORGANIZER').map((r) => r.eventId));
  return page.items.filter((e) => mine.has(e.id));
}

export function canManage(me: Me, eventId: string): boolean {
  return me.isAdmin || me.roles.some((r) => r.eventId === eventId && r.role === 'ORGANIZER');
}
