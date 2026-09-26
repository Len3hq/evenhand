# Evenhand: brief for coding agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing code; it is the rulebook. The plans behind it are in `docs/planning/` (BUILD-PLAN.md is the source of truth for decisions).

## Non-negotiables

- `docker compose up` must give a working, seeded portal with **no network at runtime**. Never add a CDN, a web font, a remote image, a telemetry call or a runtime download.
- Permissions live in the **API services**, decided **before** the database lookup (deny first). Forbidden = 403, never 404, never a redirect.
- Services: permission → deadline → write + audit (same transaction) → DTO.
- No `new Date()`, `Date.now()` or `Math.random()` outside `core/clock.ts`, `judging-engine/src/rng.ts` and tests: inject `Clock`, pass a seeded `Rng`.
- `src/judging-engine` is pure: no Nest, Prisma or I/O.
- Never hand-edit generated files (`src/api/src/generated/**`, `src/api/openapi.json`, `src/web/src/lib/api/schema.d.ts`) or a merged migration.
- Stay inside the folders your human owns (CONTRIBUTING.md §5). If a change is needed in someone else's file, stop and say so.
- Do not run `prisma migrate reset` or anything else that drops data without the human's explicit consent.

## Before saying "done"

```sh
npm run check          # format, lint, typecheck, unit + e2e tests
npm run acceptance     # when you touched routes, auth, seeding or Docker
```

Never weaken, skip or delete a failing test to make it pass. Report failures as they are.

## Useful facts

- Stack: Node 24, NestJS 12 (ESM), Prisma 7 (driver adapter `@prisma/adapter-pg`, client generated into `src/api/src/generated/prisma`), Next.js 16, Postgres 16, Vitest.
- Fixture ids are kept in `external_id`; routes accept either id (`core/refs.ts`).
- Demo tokens (`.dogfood.toml`) only work while `DEMO_MODE=true`.
- The web app has its own agent notes: `src/web/AGENTS.md` (Next.js 16 changed APIs; read `node_modules/next/dist/docs/`).
