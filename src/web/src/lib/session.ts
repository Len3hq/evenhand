import 'server-only';
import { apiGet } from './api/server';
import type { Schemas } from './api/types';

/**
 * Who is looking at the page, for deciding what to show (never for permissions: the API
 * decides those). Null when logged out, and also when the API cannot be reached, so the
 * page frame always renders and the page itself reports the problem.
 */
export async function currentUser(): Promise<Schemas['MeDto'] | null> {
  try {
    return await apiGet<Schemas['MeDto']>('/api/auth/me');
  } catch {
    // 401 (logged out) or the API being down: either way, show the logged-out frame.
    return null;
  }
}
