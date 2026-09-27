import { type NextRequest, NextResponse } from 'next/server';

/**
 * Content-Security-Policy with a fresh nonce per request (Next.js guide: content-security-policy).
 * Every page renders per request, so Next.js puts the nonce on its own scripts.
 *
 * - Scripts run only with this request's nonce ('strict-dynamic' lets them load their chunks);
 *   no inline script without it, no eval in production.
 * - Everything else only from this origin: no CDN, font host or image host can even be reached,
 *   which is the offline rule enforced by the browser too.
 * - style-src-attr 'unsafe-inline' allows style *attributes* (a progress bar's width); they
 *   cannot run code. Style elements still need the nonce.
 * - No upgrade-insecure-requests: the portal serves plain HTTP on localhost; TLS belongs to the
 *   reverse proxy in front of it (README, "Running a real event").
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Pages only: not the API (served by NestJS behind the rewrite), static files or prefetches.
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|healthz).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
