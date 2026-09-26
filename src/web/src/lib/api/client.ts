import type { ApiErrorBody } from './types';

/**
 * Browser-side calls go to the same origin (`/api/...`), which Next.js proxies to the API.
 * The browser attaches the session cookie and the Origin header itself, which is exactly
 * what the API's CSRF check expects.
 */
export async function apiPost<T>(path: `/api/${string}`, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(err?.message ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
