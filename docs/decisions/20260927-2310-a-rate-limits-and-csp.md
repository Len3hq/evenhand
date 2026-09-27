# Rate limits that match the threat model, and a nonce-based CSP

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

ALIGNED-PLAN decision 55 promised rate limits on login, failed bearer tokens, review writes and exports, each refusal audited. Only login and register were limited. The web app sent no Content-Security-Policy.

## Decision

- **Named limits per IP** (all configurable): default 300/min; login and register 10/min; **exports 30/min** with one counter across every CSV and the event JSON (the throttler counts per route by default, which a test caught); **judge review writes 120/min**, one counter for save and submit.
- **Failed credentials:** after `AUTH_FAILURES_PER_MIN` (20) failed token or session checks, the address is refused (429) for the rest of the minute, valid credentials included, so the refusal gives a guesser no signal. Only routes that need a login count: a stale cookie on public pages is not a guess.
- **Every 429 is audited** once per address and limit per minute (`request.rate_limited`), with the address, in the admin-only platform trail. Auditing never turns a 429 into a 500.
- **CSP** from `src/web/src/proxy.ts`, per the Next.js guide: a fresh nonce per request, `script-src 'self' 'nonce-…' 'strict-dynamic'`, everything else `'self'`, `frame-ancestors 'none'`, `object-src 'none'`. Two deliberate differences from the guide's example: `style-src-attr 'unsafe-inline'` (style _attributes_ such as a progress bar's width; they cannot run code), and no `upgrade-insecure-requests` (the portal serves HTTP on localhost; TLS is the reverse proxy's). The API's own pages (Swagger UI) are outside the proxy.

## Consequences (including what we gave up)

- Counters live in memory: correct for one API instance; several instances would need a shared store.
- An office behind one NAT address shares its limits; the defaults are generous for that reason.
- Per-IP limits still trust `X-Forwarded-For` from the bundled proxy (existing threat-model row): a public deployment should put a proxy in front that overwrites it.
