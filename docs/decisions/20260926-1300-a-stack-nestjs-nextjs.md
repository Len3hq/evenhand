# Stack: NestJS + Next.js + Prisma + PostgreSQL

- Status: accepted (supersedes the Django choice in BUILD-PLAN §3 item 3)
- Date: 2026-09-26 · Owner: A

## Context

The spec says "pick what you know". The team is fluent in TypeScript. Django would have given auth, admin and numpy for free.

## Decision

Node 24, NestJS 12 (API), Next.js 16 (UI), Prisma 7, PostgreSQL 16, Vitest. npm workspaces; one public port with Next proxying `/api/*`.

## Consequences

- We write auth, sessions and CSRF ourselves: covered by `tests/api/auth.e2e-spec.ts` and the isolation matrix.
- No Django admin: organiser screens are built in Next.js.
- The ridge solve needs a small hand-written Cholesky in the engine instead of numpy.
- Three containers instead of two.
