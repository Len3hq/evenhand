import type { ApiErrorBody } from './types';

/**
 * Browser-side calls go to the same origin (`/api/...`), which Next.js proxies to the API.
 * The browser attaches the session cookie and the Origin header itself, which is exactly
 * what the API's CSRF check expects.
 */
async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: `/api/${string}`,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(err?.message ?? `Request failed (${res.status})`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const apiPost = <T>(path: `/api/${string}`, body?: unknown): Promise<T> =>
  apiSend<T>('POST', path, body);

export const apiPatch = <T>(path: `/api/${string}`, body: unknown): Promise<T> =>
  apiSend<T>('PATCH', path, body);

export const apiDelete = (path: `/api/${string}`): Promise<void> => apiSend<void>('DELETE', path);
