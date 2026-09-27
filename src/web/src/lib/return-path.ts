/**
 * Where to go after logging in or registering: the `?next=` path a page sent us with. Only a
 * path on this site is accepted ("/x", not "//evil.test", "/\evil.test" or "https://…"), so
 * these pages cannot be used to send someone to another site.
 */
export function safeReturnPath(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : null;
}

/** The current page's `?next=`, if it is safe. Browser only. */
export function returnPath(): string | null {
  return safeReturnPath(new URLSearchParams(window.location.search).get('next'));
}
