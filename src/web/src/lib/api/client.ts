import type { ApiErrorBody } from './types';

/**
 * Browser-side calls go to the same origin (`/api/...`), which Next.js proxies to the API.
 * The browser attaches the session cookie and the Origin header itself, which is exactly
 * what the API's CSRF check expects.
 */
async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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

export const apiPut = <T>(path: `/api/${string}`, body: unknown): Promise<T> =>
  apiSend<T>('PUT', path, body);

export const apiDelete = (path: `/api/${string}`): Promise<void> => apiSend<void>('DELETE', path);

/**
 * Uploads one file as the multipart field "file". The browser sets the multipart boundary itself,
 * so no Content-Type is given here; it also sends the Origin the API's CSRF check expects.
 */
export async function apiUpload<T>(path: `/api/${string}`, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(path, { method: 'POST', body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(err?.message ?? `Upload failed (${res.status})`);
  }
  return (await res.json()) as T;
}
