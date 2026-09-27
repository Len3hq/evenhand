import 'server-only';
import { redirect } from 'next/navigation';
import { ApiError, apiGet } from './api/server';
import type { Schemas } from './api/types';

type Me = Schemas['MeDto'];

/**
 * Who is looking at the page, for deciding what to show (never for permissions: the API
 * decides those). Null when logged out, and also when the API cannot be reached, so the
 * page frame always renders and the page itself reports the problem.
 */
export async function currentUser(): Promise<Me | null> {
  try {
    return await apiGet<Me>('/api/auth/me');
  } catch {
    // 401 (logged out) or the API being down: either way, show the logged-out frame.
    return null;
  }
}

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
