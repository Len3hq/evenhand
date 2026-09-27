import 'server-only';
import { apiGet } from './api/server';
import type { Schemas } from './api/types';

type Me = Schemas['MeDto'];

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
