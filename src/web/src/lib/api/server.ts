import 'server-only';
import { cookies } from 'next/headers';
import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(body?.message ?? `API request failed with ${status}`);
  }
}

/**
 * Server components call the API directly on the internal network (not through the public
 * rewrite). Read at request time, so one image works in any environment.
 */
function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
}

/**
 * GET from the API during server rendering. Forwards the caller's session cookie so the API
 * applies the same permissions it would to the browser. Never cached: judging data changes.
 */
export async function apiGet<T>(path: `/api/${string}`): Promise<T> {
  const session = (await cookies()).get('session');
  const res = await fetch(`${apiBase()}${path}`, {
    cache: 'no-store',
    headers: session ? { cookie: `session=${session.value}` } : {},
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, body);
  }
  return (await res.json()) as T;
}
