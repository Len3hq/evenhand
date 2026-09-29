# Rate limits count per credential, not per address

- Status: accepted (amends [Rate limits and CSP](20260927-2310-a-rate-limits-and-csp.md))
- Date: 2026-09-29 · Owner: A

## Context

Every rate limit was keyed by the caller's address. On the portal as shipped, every browser reaches the API through the web container, so the API sees one address for everyone (the voting ADR already relies on this). A live test on the bundled stack showed what that meant:

- 21 bad bearer tokens from anyone locked **every** user out of the API for the rest of the minute, admins included (the failed-credential limiter refused valid credentials too, by design).
- Eleven different people logging in within one minute: the tenth and eleventh got 429.
- Every other limit (exports, review writes, comments, votes) was one allowance shared by the whole event.

The API also trusts `X-Forwarded-For` from the web container, and the web container passes on whatever the client sent, so a client can choose the address the API sees.

## Decision

- **Buckets are per credential** (`rateLimitTracker` in `core/rate-limit.ts`): the bearer token, else the session cookie, else a personal voting link (`/voting/passes/:token`), each hashed. Only anonymous requests fall back to the address.
- **Login and registration are per email** (`authTracker`), whatever the address. Guessing one account's password stays at 10 a minute even if the guesser changes `X-Forwarded-For`, and people signing in together no longer use up each other's attempts.
- **The failed-credential limiter refuses only failing requests.** After 20 failures in a minute from an address, further bad tokens or cookies get 429 instead of 401; a valid credential always gets through. Tokens are random 256-bit values, so the limiter is a brake, not the defence.

## Consequences

- One person can no longer lock an event out, and an organiser's export burst does not use up a judge's allowance. Tested in `security.e2e-spec.ts` (bad tokens refused, the organiser still 200; the organiser at the export limit, the admin on the same address still 200) and `auth.e2e-spec.ts` (different emails do not share a login allowance; one email stays limited across changing addresses).
- Someone who knows an email can use up that account's logins for a minute. Sessions already open are unaffected.
- A caller who invents new tokens gets a fresh bucket each time, but every invented token is a failed credential, so the address-keyed failure limiter still applies.
- Anonymous traffic still shares the address: on the bundled stack, anonymous gallery views share `RATE_LIMIT_DEFAULT_PER_MIN` per route, and ballots taken from a shared voting link share `RATE_LIMIT_VOTE_PER_MIN` (60). For a large audience, raise those limits, or put a reverse proxy that sets `X-Forwarded-For` in front of the portal.
