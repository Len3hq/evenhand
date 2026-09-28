# Contributing to Evenhand

One set of rules for everyone, human or AI agent. Read it in full once; it is short on purpose.
The team plan these rules come from is [docs/planning/TEAM-PLAN.md](docs/planning/TEAM-PLAN.md).

## 1. Setup

```sh
nvm use                # Node 24
cp .env.example .env
npm install
npm run dev            # Postgres (Docker) + engine, api :3001, web :3000, hot reload
npm run check          # format, lint, typecheck, unit + e2e tests: green before every commit
```

## 2. Layout

```
src/api/src/
  core/                guards, Actor, Clock, audit, errors, Prisma, CSV, pagination      (owner A)
  modules/<domain>/    <domain>.controller.ts  <domain>.service.ts  dto/  *.spec.ts (unit)
  seed/                fixtures.json import and demo data
  cli/                 cli.ts: seed, openapi, create-admin, reset-password, export-event, import, tokens
  generated/           Prisma client: GENERATED, git-ignored, never edit
src/api/prisma/        schema.prisma + migrations                                        (owner A)
src/web/src/
  app/                 routes (App Router)
  components/ui/       design system                                                     (owner C)
  components/<feature>/
  lib/api/             server.ts / client.ts; schema.d.ts is GENERATED (`npm run gen:api`)
src/judging-engine/src/  pure TS: no Nest, no Prisma, no I/O, no Date.now(), no Math.random()  (owner B)
tests/api/             e2e suites against a real Postgres (supertest + Vitest)
tests/ui/              browser checks: a real Chromium against the Docker stack (`npm run test:ui`)
tests/acceptance/      runs the organisers' run.py (`npm run acceptance`)
tests/offline/         the offline drill: fresh clone, network cut, every check (`npm run drill`)
```

The reference module is **`src/api/src/modules/gallery`** (controller → service → Prisma → DTO, with its e2e rows in `tests/api/isolation.e2e-spec.ts`). Copy its shape.

## 3. Backend rules (checked in review)

1. **Controllers are thin.** Validate input, call one service method, return its DTO. No Prisma in controllers.
2. **Services take `actor: Actor` first** and do four things in order: **permission → deadline → write + audit in one transaction → return a DTO.** See `submissions.service.ts`.
3. **Deny first.** Decide from the actor and the route params **before** querying for the requested thing. Forbidden is **403, never 404**. (`judging.service.ts → judgeScores` is the example.) Where the answer depends on the thing itself (an image is public exactly when its project is), look it up first and say why in the service's doc comment and an ADR.
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

## 5. Areas and hot files

The build was planned around three areas, which still say who designs and reviews what: **A** platform and security (`core/`, auth, Prisma, Docker, CI, the isolation matrix), **B** judging (`judging-engine`, `modules/judging`, rankings, duplicates, JUDGING.md) and **C** product and UI (`src/web`). Anyone may change any file, as long as the rules in §3–4 and the definition of done below hold. `.github/CODEOWNERS` names the whole team on every path, which only matters if you open a pull request.

Some files are shared by everyone and need care:

| File or area                                                             | Rule                                                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/prisma/**`                                                      | Pull first; one new migration at a time. Hand-written SQL (CHECKs, triggers) goes at the end of the migration. **Never edit a migration once it is on `main`.** |
| `app.module.ts`                                                          | Append one import line per module; never reorder.                                                                                                               |
| `package.json`, `package-lock.json`                                      | Add dependencies with `npm install <dep> -w <workspace>` in Node 24 (not by hand). A native dependency must ship prebuilt binaries and pass the offline drill.  |
| `tests/api/isolation.e2e-spec.ts`                                        | Add rows for every new endpoint; never restructure.                                                                                                             |
| `.dogfood.toml`, `acceptance-report.txt`                                 | The report is regenerated by `npm run acceptance`, never edited.                                                                                                |
| Generated files (`schema.d.ts`, `openapi.json`, `src/api/src/generated`) | Regenerate (`npm run gen:api`, `prisma generate`); never edit or merge by hand.                                                                                 |
| `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`            | Update in the same commit as the code they describe, including the numbers in the README's "Verified" table.                                                    |

## 6. Git

- **Commits go straight to `main`**, which must always pass `npm run check` and `run.py`. Pull before you start and before you commit; there are no long-lived branches.
- **Commit messages** start with a plain-language subject saying what changed for people (not a `feat(...)` prefix), followed by connected paragraphs: the problem, what changed and why, and how it was verified.
- A broken `main` is fixed first, by whoever broke it, before anything else lands.

### Definition of done (every commit)

- [ ] `npm run check` is green (format, lint, typecheck, unit and e2e tests).
- [ ] Routes, auth, seeding or Docker touched → `npm run acceptance`, `npm run test:ui` and `npm run drill` are green too.
- [ ] New endpoint → e2e test with at least one allowed and one refused actor, plus rows in the isolation matrix.
- [ ] New maths → unit tests with known inputs and outputs.
- [ ] Every mutation writes an audit row, with a readable sentence in `modules/audit/summarise.ts`.
- [ ] `npm run gen:api` re-run if the API changed.
- [ ] Decision worth defending → an ADR in `docs/decisions/` (template below); docs updated.
- [ ] Nothing new reaches the network at runtime (the drill proves it).

### Decision records

One file per decision, `docs/decisions/<yyyymmdd-hhmm>-<a|b|c>-<slug>.md` (UTC time, area letter), so nobody ever conflicts. A later decision that changes an earlier one gets its own file; the earlier one gains a dated line pointing to it and is otherwise left as written:

```md
# <Title>

- Status: accepted | superseded by <file>
- Date: 2026-09-26 · Owner: <A|B|C>

## Context

## Decision

## Consequences (including what we gave up)
```

## 7. Rules for AI agents

The root [CLAUDE.md](CLAUDE.md) is loaded by every Claude Code session. In short: follow this file, never edit generated files or merged migrations, run `npm run check` (and the acceptance, browser and offline checks when routes, auth, seeding or Docker change) before calling anything done, and never weaken or delete a failing test to make it pass.
