# DOGFOOD 2026 — Team Plan (3 people, parallel)

*Thu 24 Sep 2026. It sits on top of `BUILD-PLAN.md`: same gates (G1–G5), same decisions, same stack (NestJS + Next.js + Prisma + Postgres). This file answers **who does what, when, in which files, and what happens where our work overlaps**. It assumes decisions 55–62 from `ALIGNED-PLAN.md` are accepted.*

> **Rule zero still applies:** no project code and no commits before **Fri 25 Sep, 18:00 UTC (H0)**. Everything in §8 before H0 is paper, prose or local sketches outside the repo.

---

## 1. The three roles

Assign by strength, not by preference. The names are placeholders; put real names in at the kickoff call.

| Role | Person | Owns | Strength needed |
|---|---|---|---|
| **A: Platform & Security lead** (kicks off) | ______ | Repo, tooling, CI, Docker, Prisma schema and migrations, auth, guards, the service pattern, T1 API, the fixture importer, the isolation test matrix, the offline drills, `.dogfood.toml`, releases | Strongest backend/DevOps person; security-minded |
| **B: Judging lead** | ______ | `src/judging-engine` (the maths), the T2 API (rubric, judges, assignment, reviews, progress, duplicates merge, rankings, publish, judging CSVs), `cli rank` / `cli proof`, `JUDGING.md` | Comfortable with statistics and linear algebra; careful with edge cases |
| **C: Product & UI lead** | ______ | `src/web`: design system, every page, the judge console, the organiser screens, the results/Receipt page, accessibility, README quickstart, the demo video | Strongest React/Next.js and design person |

**Why this split works:** each person owns a **separate folder** for most of the weekend:
- A: `src/api/src/core`, `src/api/src/modules/{auth,events,teams,submissions,gallery,audit,exports}`, their e2e files in `tests/api/`, `src/api/prisma/`, `docker/`, root config;
- B: `src/judging-engine`, `src/api/src/modules/{judging,rankings,duplicates}`, their e2e files in `tests/api/`;
- C: `src/web`.

The overlaps are few, known in advance, and handled in §4.

**Backup pairs**, so nobody is a single point of failure: A ↔ B cover each other's API code; C's backup is A for organiser pages (§6, flex rule). Everyone must be able to explain the schema and the normalization model in writing (BUILD-PLAN decision 41).

---

## 2. Kickoff: A lays the foundation (H0–H4)

The first four hours decide whether the codebase looks like one person wrote it. A builds the foundation; B and C start in folders that don't depend on it.

### 2.1 H0–H0:30: kickoff call (all three)

1. Download `run.py`, `fixtures.json` and `spec.md` (confirm nothing changed since 24 Sep).
2. Walk through the 7 checks together (BUILD-PLAN §12) and confirm `.dogfood.toml`.
3. Confirm the **API contract table** (§5) and the **ownership map** (§4). Fill in names.
4. Agree the sleep rota (§7) and the check-in times.

### 2.2 H0:30–H1:15: A pushes **skeleton v0** (unblocks B and C)

- npm workspaces: `src/api`, `src/web`, `src/judging-engine`, plus a root `tests/` folder. This follows the spec's repo figure (`src/` = all code written in the window, `tests/` = our own suite).
- Node 24 pinned (`.nvmrc`, `engines`); TypeScript `strict` everywhere; ESLint + Prettier with **one shared config at the root**; `.editorconfig`.
- Empty Nest app, empty Next.js app, empty engine package with Vitest (see docs/decisions/20260926-1305).
- **Every dependency from BUILD-PLAN §5.1 installed now**, so `package-lock.json` rarely conflicts later.
- CI (GitHub Actions): install → lint → typecheck → unit tests → build.
- Root scripts, identical for everyone (see §3.4).
- MIT `LICENSE`, `.gitignore`, `.env.example`.

As soon as v0 is on `main`, B works in `src/judging-engine` and C in `src/web`. Neither folder needs anything else from A yet.

### 2.3 H1:15–H4: A builds **foundation v1**

In this order, each step merged separately:
1. **`docker-compose.yml`** with `db`, `api` and `web`, healthchecks, the Next.js rewrite and a named volume (BUILD-PLAN §5).
2. **`schema.prisma` for the whole data model** (BUILD-PLAN §6), including the judging tables, written from hand-drafted DATA-MODEL.md. It goes in as **one initial migration** plus the hand-written SQL (partial unique index, audit trigger, score CHECKs). **B reviews the judging tables before merge.** Doing the whole schema up front means very few migrations collide later.
3. **Core module** (`src/api/src/core`):
   - `SessionGuard` (cookie + bearer), `RolesGuard`, `@Public()`, `@Roles()`;
   - an `Actor` object: user, per-event roles, and judge ids (internal and external);
   - `Clock` provider; `PrismaService`;
   - `AuditService.record(tx, …)`;
   - `DomainError` + a global exception filter returning `{statusCode, error, message}`;
   - Origin check; pagination and CSV helpers; `/api/healthz`.
4. **The golden slice:** `GET /api/projects` (public gallery) end to end: controller → service → Prisma → DTO → e2e test → the OpenAPI entry → C's gallery page consuming generated types. **Everyone copies this slice's shape.**
5. **`CLAUDE.md` + `CONTRIBUTING.md`**: the build guide (§3). Every Claude Code session on the team reads `CLAUDE.md` automatically, so the agents follow the same rules as the humans.

**Foundation is "done" when:** `npm run dev` works for all three people on their own machines, the golden slice test passes in CI, and B and C have each merged one PR that follows the guide.

---

## 3. The build guide (A writes this into `CONTRIBUTING.md` + `CLAUDE.md` at H1–H4)

This is the single set of rules for humans and AI agents alike. Keep it short enough to be read in full.

### 3.1 Repo layout

```
src/                       all code written in the window (matches the spec's repo figure)
  api/src/
    core/                  guards, Actor, Clock, audit, errors, prisma, csv, pagination   (owner A)
    modules/<domain>/      <domain>.controller.ts  <domain>.service.ts  dto/  *.spec.ts (unit)
    cli/                   cli.ts + one file per command
  web/src/
    app/                   routes (App Router)
    components/ui/         design system (owner C)
    components/<feature>/  feature components
    lib/api/               typed client; schema.d.ts is GENERATED from OpenAPI, never hand-edited
  judging-engine/src/      pure TS: no Nest, no Prisma, no I/O, no Date.now(), no Math.random()
tests/                     our own suite, beyond the acceptance one (matches the spec's figure)
  api/<domain>.e2e-spec.ts supertest against a real Postgres; owned by the domain's owner
  api/isolation.e2e-spec.ts the actor × endpoint matrix (owner A; B adds rows)
  acceptance/              the script that downloads run.py and runs it (run.py is not committed, §3.4)
src/api/prisma/            schema.prisma, migrations/ (owner A)
data/fixtures.json         the one copy (decision 58); run.py finds it beside .dogfood.toml
docs/decisions/            one ADR per file (see 3.6)
```

### 3.2 Backend rules (enforced in review)

1. **Controllers are thin.** They parse and validate, then call one service method. No Prisma in controllers.
2. **Every service method takes `actor: Actor` first** and runs four steps in this order: **permission → deadline → write + audit in one transaction → return DTO** (BUILD-PLAN §5.1).
3. **Deny first.** Permission checks use the actor and the route params only, **before** any database lookup. Forbidden → 403, never 404 (decision 34).
4. **No redirects anywhere under `/api`.** Unauthenticated → 401 JSON.
5. **Time only from `Clock`; randomness only from a seeded RNG passed in.** A lint rule bans `new Date()` / `Date.now()` / `Math.random()` outside `core/clock.ts` and tests.
6. **Errors:** `throw new DomainError(403, "submissions_closed")`. Error codes are `snake_case` and listed in `core/errors.ts`.
7. **DTOs:** class-validator with `whitelist` + `forbidNonWhitelisted`. No `any`. Every endpoint carries `@ApiTags` and response types, so OpenAPI is complete (decision 62).
8. **Accept either id.** Any route taking an event, judge or project id accepts the internal id or the fixture `externalId` (decision 50), through one shared resolver in `core`.

The pattern, shown once in the golden slice:

```ts
// shape only; the real code lives in the golden slice
async updateSubmission(actor: Actor, ref: string, dto: UpdateSubmissionDto) {
  this.perm.assertTeamMember(actor, ref);                       // 1. permission, before lookup
  this.deadline.assertOpen(actor.event, this.clock.now());      // 2. deadline
  return this.prisma.$transaction(async (tx) => {               // 3. write + audit together
    const before = await tx.submission.findUniqueOrThrow(/* … */);
    const after  = await tx.submission.update(/* … */);
    await this.audit.record(tx, actor, "submission.updated", { before, after });
    return toSubmissionDto(after);                              // 4. DTO out, never a raw row
  });
}
```

### 3.3 Frontend rules

1. Pages fetch only through `lib/api`, typed from the generated `schema.d.ts`. Run `npm run gen:api` after any API change.
2. Data pages are dynamic or client components; `next build` must succeed with no database (BUILD-PLAN §5.2).
3. **UI primitives only from `components/ui`** (Button, Input, Select, Table, Form, Badge, Dialog, Toast, EmptyState, ErrorState). Tailwind tokens live in one config. No one-off colours.
4. Every page handles four states: loading, empty, error (showing the API's `error` code in plain words), and success.
5. Keyboard first where it matters: the judge console must work with no mouse.
6. The UI hides what a role can't do, as a convenience only. **Never** treat the UI as the security boundary.

### 3.4 Commands (identical for everyone)

| Command | Does |
|---|---|
| `npm run dev` | Starts `db` in Docker; runs api and web locally with hot reload (web rewrites to `localhost:3001` in dev) |
| `npm run db:reset` | Resets the dev database, migrates and imports the fixtures |
| `npm run check` | Lint + typecheck + unit + e2e. **Must pass before any PR.** |
| `npm run gen:api` | Regenerates OpenAPI + `src/web/src/lib/api/schema.d.ts` |
| `npm run acceptance` | `docker compose up -d --build`, waits for health, downloads the **official** `run.py` into a git-ignored `.cache/` (reuses the cached copy when offline), runs it, writes `acceptance-report.txt`. We don't commit `run.py`: it's the organisers' file, it carries no licence, and they run their own copy anyway. |
| `npm run cli -- <cmd>` | import-fixtures, export-event, rank, proof, rotate-tokens |

### 3.5 Git and review

- **Trunk-based development.** `main` is always green and always passes `run.py`. Branches are short-lived (under 4 hours), named `a/…`, `b/…`, `c/…`.
- **Small PRs**: aim for under 400 changed lines, excluding generated files. Squash-merge. Conventional Commits (`feat(judging): …`, `fix(auth): …`).
- **One reviewer** for every PR, with a **30-minute review turnaround** while the reviewer is awake. Rotation: A reviews B, B reviews C, C reviews A.
- **Mandatory reviewers regardless of rotation:**
  - anything touching guards, `Actor`, permissions or auth → **A**;
  - anything touching `judging-engine` or ranking → **B**.

  These reviewers are also set in `.github/CODEOWNERS`.
- If the required reviewer is asleep and the change is **not** security or maths, merge once CI is green and tag them for a post-merge review.
- **CI gate on every PR:** `npm run check` + build images. **On `main`:** also `npm run acceptance` (compose + run.py). A red `main` stops all merging until it's fixed; whoever broke it fixes it first.

### 3.6 Definition of done (every PR)

- [ ] `npm run check` is green locally and in CI.
- [ ] New endpoint → e2e test with **at least one allowed and one denied actor**, plus a row in the isolation matrix.
- [ ] New maths → unit tests with known inputs and outputs.
- [ ] Every mutation writes an audit row.
- [ ] OpenAPI regenerated if the API changed.
- [ ] Any decision worth defending → an ADR in `docs/decisions/<yyyymmdd-hhmm>-<initial>-<slug>.md`. One file per ADR, so nobody conflicts. DECISIONS.md is generated as an index at the end.
- [ ] No new dependency without a heads-up in chat (lockfile conflicts, offline build).

### 3.7 Rules for AI agents (in `CLAUDE.md`)

- Follow 3.1–3.6. Read the golden slice before writing a new module.
- **Stay inside your owner's folders** (§4). If a change is needed in a hot file, stop and tell the human, don't do it silently.
- Never hand-edit generated files (`schema.d.ts`, Prisma client) or an already-merged migration.
- Run `npm run check` before calling a task done. Don't weaken, skip or delete a failing test to make it pass.
- No mass refactors or renames across folders.
- Humans review AI-written diffs like any other diff. The author must be able to defend every line in writing (the judges' follow-up window is 29 Sep – 8 Oct).

---

## 4. Ownership map and collision rules

**Principle:** every file has one owner. Others may change it only under the protocol listed.

| Resource | Owner | Others may… | Protocol |
|---|---|---|---|
| `prisma/schema.prisma` + `migrations/` | A | B proposes changes to judging tables | **Migration lock:** post "🔒 migration" in chat → rebase on `main` → `prisma migrate dev --create-only` → merge → post "🔓". Only one open PR with a migration at a time. Never edit a merged migration. If two collide anyway, the later PR deletes its migration, rebases and regenerates. |
| `src/api/src/core/**` (guards, Actor, audit, errors) | A | Use it; request changes | A makes the change. B/C open an issue or ask in chat. |
| `app.module.ts` (module registration) | A | Append one import line | Hot file: append only, never reorder. Conflicts are one line; keep both. |
| `package.json` / `package-lock.json` | A | Add a dependency with a heads-up | Announce in chat. On conflict: take `main`'s lockfile, re-run `npm install <dep>`, commit. |
| `docker-compose.yml`, Dockerfiles, CI | A | Request changes | A only. These break everyone at once. |
| `.dogfood.toml`, `acceptance-report.txt` | A | Run `npm run acceptance` locally | Only A commits the report, at each gate. |
| Fixture importer (`cli/import-fixtures`) | A (T1 entities) | B owns `importReviews()` in the judging module | The importer calls B's function for scores → assignments and reviews. A doesn't write review logic; B doesn't touch the T1 import. |
| Duplicate handling | **Detection:** A (submissions service raises a `DuplicateFlag` at import and submit). **Merge/unmerge:** B | – | The `DuplicateFlag` table is the handoff. A creates flags; B acts on them. |
| Checker endpoints | A: checks 1–3. B: checks 4–7 | – | Both are needed for G1. B's endpoints ship in the first judging-module PR (H4–H8). |
| CSV exports | A: registrations, teams, submissions. B: assignments, reviews, **scores (check 7)**, results | Both use `core/csv` | Same header rules (decision 32). |
| Audit log | A: `AuditService` + audit API + hash chain (stretch). C: audit page | B calls `audit.record` | Action names are `domain.verb` (e.g. `review.submitted`), listed in `core/audit-actions.ts`. Add new ones in your own PR, one line each. |
| Isolation test matrix (`tests/api/isolation.e2e-spec.ts`) | A | B adds rows for judging endpoints | Table-driven: add rows, never restructure. |
| `src/web/**` | C | A, only for `/organizer/settings/*` under the flex rule (§6) | A works only inside that folder, using C's components. |
| `src/web/src/lib/api/schema.d.ts` | Generated | Anyone regenerates | Conflict → rerun `npm run gen:api`, never merge by hand. |
| `src/judging-engine/**` | B | – | Pure functions only (3.1). |
| `README.md` | C (quickstart, walkthrough, screenshots) + A (ops, env, troubleshooting, limits) | – | Section-owned: each edits only their headed sections. |
| `ARCHITECTURE.md`, `DATA-MODEL.md` | A (B writes the judging-tables section of DATA-MODEL) | – | Section-owned |
| `JUDGING.md` | B, except the **"Threat model"** section, owned by A | – | Section-owned |
| Demo video | C (edits); A and B record their own segments | – | Script from BUILD-PLAN §14 |

**Heads-up protocol for anything not in this table:** post "touching `<file>` for `<reason>`, ~N min" in chat before editing a file you don't own. The owner can say "wait" within 10 minutes; otherwise go ahead.

---

## 5. API contract (confirmed at the kickoff call)

**Contract-first:** at the start of each window, the API owner merges the **DTOs + controller signatures returning `501 not_implemented`**, then runs `npm run gen:api`. C builds against the generated types straight away, using local sample JSON until the real endpoint lands. This is the main tool that keeps C from waiting on A and B.

| Area | Endpoints (all under `/api`) | Owner | Needed by (C) |
|---|---|---|---|
| Health | `GET /healthz` | A | H4 |
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /auth/register`, `GET /auth/me` | A | H4 |
| Gallery | `GET /projects?q=&track=&tag=&page=` (public, check 1–2), `GET /projects/:id` | A | H4 (golden slice) |
| Events | `POST /events`, `GET/PATCH /events/:id`, `/events/:id/tracks`, `/prizes`, `/questions` (CRUD) | A | H12 |
| Teams | `POST /events/:id/teams`, `GET /teams/:id`, `POST /teams/:id/invites`, `GET/POST /invites/:token` | A | H12 |
| Submissions | `POST /events/:id/submissions` (check 3), `GET/PATCH /submissions/:id`, `POST /submissions/:id/submit`, `POST /submissions/:id/images`, `GET /files/:id` | A | H14 |
| T1 exports | `GET /events/:id/export/{registrations,teams,submissions}.csv` | A | H20 |
| Audit | `GET /events/:id/audit?actor=&action=&page=` | A | H30 |
| Rubric | `GET/PUT /events/:id/criteria` | B | H24 |
| Judges | `POST /events/:id/judges` (invite + tracks), `GET /events/:id/judges` | B | H24 |
| Assignment | `POST /events/:id/assignments/run` (batch), `GET /events/:id/assignments` | B | H26 |
| Judge work | `GET /judge/queue`, `GET/PUT /judge/reviews/:assignmentId` (draft autosave), `POST /judge/reviews/:assignmentId/submit` | B | H26 |
| Isolation checks | `GET /judge/scores` (check 4, 6), `GET /judges/:judgeId/scores` (check 5) | B | H8 |
| Progress | `GET /events/:id/progress` | B | H30 |
| Duplicates | `GET /events/:id/duplicates`, `POST /duplicates/:id/{confirm,dismiss,unmerge}` | B | H34 |
| Rankings | `POST /events/:id/rankings` (run), `GET /rankings/:id` (Receipt), `POST /rankings/:id/publish`, `GET /events/:id/results` (public after publish) | B | H38 |
| Judging exports | `GET /events/:id/export/{assignments,reviews,scores,results}.csv` (scores = check 7) | B | H8 (scores), H36 (others) |
| Rate limits | `@nestjs/throttler` on login, bearer-auth failures, review writes, exports → 429 (decision 55) | A (config); B applies it to its routes | – |

---

## 6. The 72 hours, person by person

H0 = Fri 25 Sep 18:00 UTC. The gates are BUILD-PLAN's. **A is the gatekeeper**: runs `npm run acceptance` and the offline drill, and commits the report.

| Window | A: Platform & Security | B: Judging | C: Product & UI | Gate |
|---|---|---|---|---|
| **H0–H4** | Kickoff call; skeleton v0 (H1:15); foundation v1: compose, full schema + initial migration, core module, golden slice, CLAUDE.md / CONTRIBUTING.md | Kickoff call; after v0: engine types, weighted score, **Cholesky solver + tests**, ridge fit on a toy dataset; reviews the judging tables in the schema PR | Kickoff call; after v0: Tailwind tokens, `components/ui` kit, app layout and navigation, `lib/api` wrapper; login page against the auth contract | Foundation done |
| **H4–H8** | Fixture importer (T1 entities), fixed seed tokens + printed logins, checks 1–3 (gallery ordering by `seed_order`, deadline guard before validation), `.dogfood.toml` | `importReviews()`, judging module with checks 4–6 (deny-first) and `scores.csv` (check 7), each with e2e tests; engine: fit on the **real fixtures** | Gallery + project detail on real data, login/logout flow, role-aware navigation | **G1 (H8):** 7/7 PASS, report committed, **offline drill #1** |
| **H8–H24** (includes each person's first sleep) | Register; events/tracks/prizes/questions CRUD; teams + invites; submissions draft/edit/submit with full field set, custom answers, uploads; deadline on every write verb; gallery search/filter; open demo event; T1 CSVs; Origin check; rate limits (55); isolation matrix harness | Engine: λ by leave-one-out (hat-matrix shortcut), posterior SD, **tie groups without chaining (59)**, connectivity report, z-score comparator (56), **synthetic recovery test (52/56)**; assignment algorithm (pure) + API; rubric + judge-invite APIs; contracts for judge work posted by H20 | Register, event page, team create/join/invite pages, **submission form** (full field set, custom questions, images, draft state, closed-deadline state), organiser event settings using generic forms | **G2 (H24):** still 7/7 |
| **H24–H36** | Audit API; isolation matrix covering **every** endpoint including B's; backup/restore scripts; `/healthz` in compose; ARCHITECTURE.md; **flex rule:** if C is behind at H24, A builds the `/organizer/settings/*` pages | Judge queue + review draft/submit APIs; progress API; judging CSVs; duplicate confirm/dismiss/unmerge (Dry Harbour, decisions 5–7); applies rate limits to its routes | **Judge console** (one project per screen, keys 1–5, Tab/Enter, autosave, progress bar, Next follows queue); progress dashboard (10s polling); rubric editor; judges + assignment page | **G3 (H36):** report committed, **offline drill #2** |
| **H36–H46** | `cli export-event` JSON round trip + test; DATA-MODEL.md final; threat model section of JUDGING.md; **if ahead:** hash-chained audit (stretch #1) | RankingRun + Receipt (reasons, SD, tie groups, rank change, SHA-256), publish, public results API; `cli rank` (`--diff`, `--explain`); `cli proof` → `docs/proof/`; JUDGING.md with the proof tables | **Results / Receipt page** (raw vs normalized, ▲/▼, reason, tie groups, low-evidence badge, neutral wording, decision 60), publish flow, public results page, duplicates page, audit log page | **G4 (H46):** proof reproduces; ρ > 0.9 and beats raw and z-score |
| **H46–H56** | **Offline drill #3**: fresh clone, `down -v`, network off, arm64 (+ x86); bug triage lead; README ops / env / troubleshooting / honest limits | End-to-end check of Dry Harbour merge → re-rank; sensitivity tables (λ ×0.5 / ×2, alternative weights); DATA-MODEL judging section | UX pass on all four states for every page; accessibility (labels, focus, contrast); **draft video at H54** | **G5 (H56):** fresh clone to green, offline, clean volume |
| **H56–H60** | Bug bash: tests C's UI flows | Bug bash: tests A's T1 flows | Bug bash: tests B's judging flows | **Feature freeze at H60** |
| **H60–H68** | Fixes; README final; AI-use disclosure | Fixes; JUDGING.md final; write-up material (screenshots, λ curve) | Fixes; README quickstart + screenshots; **final video** (A and B record their segments by H64) | Docs complete |
| **H68–H72** | **Release captain:** freeze at **H70**, final `npm run acceptance`, commit report, `git tag v1.0-freeze`, submit | From the tag: a clean clone reproduces the proof numbers | Video uploaded, link in README, submission form | Submitted |

**Flex rules (decided now, so nobody argues at 3 a.m.):**
- **C behind at H24?** A takes `/organizer/settings/*` (events, tracks, prizes, questions pages), using C's components only.
- **B behind at H36?** Cut in this order: sensitivity tables → `--diff` → connectivity *warning* at assignment (keep the report). Never cut the synthetic test or the tie groups.
- **A behind at H24?** B takes the T1 CSVs and the isolation-matrix rows for T1 endpoints.
- **Any gate red?** Everyone stops feature work and helps the owner of the failing check until it's green (BUILD-PLAN hard rule).

---

## 7. Communication and rhythm

- **One chat channel** with three pinned items: the ownership map (§4), the migration lock status, and the current gate status.
- **Check-ins:** 10 minutes, at each gate plus every ~6 waking hours. Three lines each: *done / next / blocked on*.
- **Sleep rota:** stagger it so there are **never zero people awake** and **never only one person awake for more than about 3 hours**. Each person gets two blocks of at least 6 hours over the weekend. Fill in by UTC at the kickoff call:

| Person | Sleep 1 (Fri → Sat) | Sleep 2 (Sat → Sun) | Sleep 3 (Sun → Mon, short) |
|---|---|---|---|
| A | ______ | ______ | ______ |
| B | ______ | ______ | ______ |
| C | ______ | ______ | ______ |

  **Before sleeping:** merge or push your branch, post a handoff note (what's in flight, what's blocked), and make sure `main` is green.
- **Task board:** one GitHub issue per row of §6, labelled `owner:A|B|C` and `gate:G1…G5`. C creates them from this file during H0–H1, while waiting for skeleton v0.
- **Decisions:** anything the team argues about for more than 10 minutes becomes an ADR (3.6), and the domain owner decides.

---

## 8. Before kickoff (now → Fri 18:00 UTC; no repo, no code)

| A | B | C |
|---|---|---|
| Draft the text of CONTRIBUTING.md / CLAUDE.md from §3 (prose, kept outside the repo) | Work the ridge model by hand on jdg_07 + jdg_01 + jdg_23; write out the Cholesky and LOO steps on paper | Paper or Figma wireframes: gallery, submission form, judge console, Receipt page |
| Hand-write DATA-MODEL.md prose from BUILD-PLAN §6 | Outline JUDGING.md: sections, equations, which tables the proof needs | Pick design tokens (type scale, spacing, 6–8 colours, light and dark) |
| Pre-pull `node:24-bookworm-slim` and `postgres:16`; note versions to pin; check the Prisma engine question | Define the engine's TypeScript input/output types on paper | List every page × its four states × the endpoint it needs (checks §5 for gaps) |
| Ask Discord: offline `build` vs `up`; how to present T3/T4 claims | Re-read BUILD-PLAN §7–§8 | Draft the video storyboard from BUILD-PLAN §14 |

All three: read BUILD-PLAN §1, §4, §5.2 and §12, and this file. Fill in the names in §1 and the sleep rota in §7.

---

## 9. Best practices for a build like this

1. **Walking skeleton first.** Get all 7 checks passing end to end by H8 with thin endpoints, then widen. A working thin system beats three half-finished deep ones.
2. **`main` always passes the checker.** CI runs `run.py` against the real compose stack on every merge to `main`. We find regressions within minutes, not at H70.
3. **Contract-first APIs.** Stubbed DTOs and OpenAPI before implementation. Frontend and backend move in parallel instead of in sequence.
4. **Functional core, imperative shell.** The judging maths is pure, deterministic and tested with no database, so B can build and prove it from H1 without waiting for anyone.
5. **Table-driven permission tests.** One matrix of actor × endpoint × expected status. New endpoints add rows. It doubles as evidence for the Judging Integrity criterion.
6. **One owner per file**, with explicit protocols for the hot files. Most merge pain comes from shared files nobody owns.
7. **Generated code is never edited by hand.** Regenerate on conflict.
8. **Determinism everywhere.** Injected clock, seeded RNG, fixed seed tokens, fixture order. If a test is flaky, fix it that hour.
9. **Write decisions as you make them.** ADRs and docs grow during the build; H60–H68 is for polish, not first drafts. Judges will ask for written defences.
10. **One shared agent brief.** A shared `CLAUDE.md` makes three people's AI agents write code in one style. Review AI output as strictly as human code.
11. **Freeze early.** No features after H60, release at H70. The last hours always cost more than planned.
12. **Rehearse the release.** The offline drill runs at G1, G3 and G5, so submission day holds no surprises.
