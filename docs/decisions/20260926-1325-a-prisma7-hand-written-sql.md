# Prisma 7 specifics and hand-written SQL constraints

- Status: accepted
- Date: 2026-09-26 · Owner: A

## Context

Prisma 7 changed its setup: `prisma.config.ts`, a generated client in the source tree, and a driver adapter. It cannot express partial indexes, CHECK constraints or triggers.

## Decision

- Generator `prisma-client` (ESM, `.js` import extensions) into `src/api/src/generated/prisma` (git-ignored, generated at build); `@prisma/adapter-pg`.
- `prisma` is a runtime dependency; the entrypoint runs `migrate deploy` without `npx`.
- One migration per concern; the constraints migration holds the partial unique index, the append-only audit triggers, the score-range trigger and the rubric CHECKs. Each is tested.
- Triggers raise with the default SQLSTATE (P0001): Prisma maps `restrict_violation` to a misleading "foreign key" error.
- The api image installs OpenSSL in every stage, and the build fails if the matching schema engine is missing (Prisma picks the engine by the OpenSSL version it sees at install).

## Consequences

`prisma migrate diff` shows no drift for the hand-written objects (checked), so `migrate dev` does not try to drop them. Prisma blocks `migrate reset` for AI agents; the e2e setup resets its own `*_test` database with plain SQL instead.
