# Contributing to Evenhand

One set of rules for everyone, human or AI agent. Read it in full once; it is short on purpose.
The team plan these rules come from is [docs/planning/TEAM-PLAN.md](docs/planning/TEAM-PLAN.md).

## 1. Setup

```sh
nvm use                # Node 24
cp .env.example .env
npm install
npm run dev            # Postgres (Docker) + engine, api :3001, web :3000, hot reload
npm run check          # everything CI runs; must be green before a PR
```

## 2. Layout

```
src/api/src/
  core/                guards, Actor, Clock, audit, errors, Prisma, CSV, pagination      (owner A)
  modules/<domain>/    <domain>.controller.ts  <domain>.service.ts  dto/  *.spec.ts (unit)
  seed/                fixtures.json import and demo data
  cli/                 cli.ts: seed, openapi
  generated/           Prisma client: GENERATED, git-ignored, never edit
src/api/prisma/        schema.prisma + migrations                                        (owner A)
src/web/src/
  app/                 routes (App Router)
  components/ui/       design system                                                     (owner C)
  components/<feature>/
  lib/api/             server.ts / client.ts; schema.d.ts is GENERATED (`npm run gen:api`)
src/judging-engine/src/  pure TS: no Nest, no Prisma, no I/O, no Date.now(), no Math.random()  (owner B)
tests/api/             e2e suites against a real Postgres (supertest + Vitest)
tests/acceptance/      runs the organisers' run.py
```

The reference module is **`src/api/src/modules/gallery`** (controller → service → Prisma → DTO, with its e2e rows in `tests/api/isolation.e2e-spec.ts`). Copy its shape.

## 3. Backend rules (checked in review)

1. **Controllers are thin.** Validate input, call one service method, return its DTO. No Prisma in controllers.
2. **Services take `actor: Actor` first** and do four things in order: **permission → deadline → write + audit in one transaction → return a DTO.** See `submissions.service.ts`.
3. **Deny first.** Decide from the actor and the route params **before** querying for the requested thing. Forbidden is **403, never 404**. (`judging.service.ts → judgeScores` is the example.)
4. **Never redirect under `/api`.** Unauthenticated → 401 JSON. Errors are always `{ statusCode, error, message }`.
5. **Time only from `Clock`, randomness only from a seeded `Rng`.** ESLint rejects `new Date()`, `Date.now()` and `Math.random()` outside `core/clock.ts`, `judging-engine/src/rng.ts` and tests.
6. **Errors:** `throw new DomainError(403, 'submissions_closed', 'human message')`. Add new codes to `ERROR_CODES` in `core/errors.ts`.
7. **Every mutation writes an audit row** in the same transaction: `this.audit.record(tx, {...})`. Actions are `domain.verb`, listed in `core/audit-actions.ts`.
8. **DTOs:** class-validator; unknown fields are rejected (`forbidNonWhitelisted`). Add a doc comment to each field: the Swagger plugin turns it into the OpenAPI description.
9. **IDs:** routes accept the internal UUID or the fixture id (`evt_01`, `jdg_24`, `prj_07`). Use `byRef()` / `eventByRef()` from `core/refs.ts`.
10. **Nest DI needs value imports.** Import injected classes normally (not `import type`), or `emitDecoratorMetadata` has nothing to emit.

## 4. Frontend rules

1. Server components fetch with `apiGet()` from `lib/api/server.ts`; browser code with `apiPost()` from `lib/api/client.ts`. Types come from `lib/api/types.ts` (generated). Never hand-write API types.
2. Data pages set `export const dynamic = 'force-dynamic'`. `next build` must succeed with no API or database running.
3. UI primitives only from `components/ui`; colours only from the tokens in `app/globals.css`.
4. Every page handles loading, empty, error (showing the API's message) and success.
5. The UI may hide what a role cannot do, but it is never the security boundary.
6. Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API you are unsure of (see `src/web/AGENTS.md`).
7. No network at build or run time: no `next/font/google`, no CDN scripts, no remote images.

## 5. Ownership and collisions

Every file has one owner. Change someone else's file only as described here; for anything not listed, post "touching `<file>` for `<reason>`" in chat first.

| Resource                                                                 | Owner                                          | Rule for everyone else                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/prisma/**`                                                      | A                                              | **Migration lock:** post 🔒 → rebase on `main` → `npm run migrate:dev -w @evenhand/api -- --create-only --name <x>` → review the SQL → merge → post 🔓. One open migration PR at a time. Never edit a merged migration. |
| `src/api/src/core/**`                                                    | A                                              | Use freely; ask A for changes                                                                                                                                                                                           |
| `app.module.ts`                                                          | A                                              | Append one import line; never reorder                                                                                                                                                                                   |
| `package.json`, `package-lock.json`                                      | A                                              | Announce new dependencies. On lockfile conflict: take `main`'s, re-run `npm install <dep>`                                                                                                                              |
| `docker-compose.yml`, `docker/**`, `.github/**`                          | A                                              | Ask A                                                                                                                                                                                                                   |
| `.dogfood.toml`, `acceptance-report.txt`                                 | A                                              | Only A commits the report, at each gate                                                                                                                                                                                 |
| `src/api/src/seed/fixture-importer.service.ts`                           | A (T1 entities) / B (scores → reviews section) | Stay in your section                                                                                                                                                                                                    |
| `src/api/src/modules/judging/**`, `rankings`, `duplicates`               | B                                              | –                                                                                                                                                                                                                       |
| `src/judging-engine/**`                                                  | B                                              | Pure functions only                                                                                                                                                                                                     |
| `tests/api/isolation.e2e-spec.ts`                                        | A                                              | Add rows for your endpoints; never restructure                                                                                                                                                                          |
| `src/web/**`                                                             | C                                              | A may build `/organizer/settings/*` pages under the flex rule                                                                                                                                                           |
| Generated files (`schema.d.ts`, `openapi.json`, `src/api/src/generated`) | nobody                                         | Regenerate (`npm run gen:api`, `prisma generate`); never merge by hand                                                                                                                                                  |
| `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`            | per section                                    | Edit only your own headed sections                                                                                                                                                                                      |

## 6. Git and review

- **Trunk-based.** `main` always passes CI and `run.py`. Short-lived branches (< 4 h): `a/…`, `b/…`, `c/…`.
- **Small PRs** (< 400 changed lines excluding generated files), squash-merged, [Conventional Commits](https://www.conventionalcommits.org/) (`feat(judging): …`, `fix(auth): …`).
- **One reviewer, 30-minute turnaround.** Rotation A → B → C → A. Anything touching auth, guards or permissions needs **A**; anything touching the engine or ranking needs **B** (enforced by `.github/CODEOWNERS`).
- A red `main` stops all merging until the person who broke it fixes it.

### Definition of done (every PR)

- [ ] `npm run check` is green.
- [ ] New endpoint → e2e test with at least one allowed and one refused actor, plus rows in the isolation matrix.
- [ ] New maths → unit tests with known inputs and outputs.
- [ ] Every mutation writes an audit row.
- [ ] `npm run gen:api` re-run if the API changed.
- [ ] Decision worth defending → an ADR in `docs/decisions/` (template below).
- [ ] No new dependency without a heads-up.

### Decision records

One file per decision, `docs/decisions/<yyyymmdd-hhmm>-<a|b|c>-<slug>.md`, so nobody ever conflicts:

```md
# <Title>

- Status: accepted | superseded by <file>
- Date: 2026-09-26 · Owner: <A|B|C>

## Context

## Decision

## Consequences (including what we gave up)
```

## 7. Rules for AI agents

The root [CLAUDE.md](CLAUDE.md) is loaded by every Claude Code session. In short: follow this file, stay inside your owner's folders, never edit generated files or merged migrations, run `npm run check` before calling anything done, and never weaken or delete a failing test to make it pass.
