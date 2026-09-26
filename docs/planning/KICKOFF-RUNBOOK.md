# Evenhand — Kickoff Runbook

*Fri 25 Sep 2026. Goal: skeleton v0 on `main` by **18:40 UTC**, so B and C start working within the first hour. This file holds commands and checklists only, not project code. Nothing below is run inside the project folder before 18:00 UTC.*

---

## Part 1: Now → 18:00 UTC (allowed: setup, downloads, reading, planning)

None of this writes project code. It removes every wait from the first hour.

### 1.1 Everyone (A, B and C)

- [ ] **Node 24 LTS** installed and active: `nvm install 24 && nvm alias default 24`, then check with `node -v`. *(Frank's machine currently has v22.23.2.)*
- [ ] **Docker Desktop running**, with at least 6 GB of memory set. Check with `docker version`. *(On Frank's machine, `docker version` returned no server just now: start Docker Desktop.)*
- [ ] Pre-pull the images: `docker pull node:24-bookworm-slim && docker pull postgres:16`
- [ ] **Warm the npm cache** with the pinned versions from 1.2. This only downloads packages; it writes no code: `npm cache add <pkg>@<version>` for each package in BUILD-PLAN §5.1.
- [ ] GitHub CLI signed in: `gh auth status`
- [ ] Claude Code up to date; read TEAM-PLAN §3 (the build guide) and SPEC-CHECK.md.
- [ ] Python 3 available for `run.py`: `python3 --version`

### 1.2 Person A: pin versions (reading, not code)

Run these and write the versions into the table. They are pinned in the first commit.

| Package | Command | Pinned version |
|---|---|---|
| Node image | `docker image inspect node:24-bookworm-slim --format '{{index .RepoDigests 0}}'` | |
| Postgres image | `docker image inspect postgres:16 --format '{{index .RepoDigests 0}}'` | |
| @nestjs/cli / @nestjs/core | `npm view @nestjs/cli version` / `npm view @nestjs/core version` | |
| next / create-next-app | `npm view next version` | |
| prisma / @prisma/client | `npm view prisma version` | |
| typescript, jest, supertest, class-validator, @nestjs/swagger, @nestjs/throttler, @node-rs/argon2, csv-stringify, tailwindcss | `npm view <pkg> version` | |

- [ ] **Prisma engine check:** read the release notes for the pinned Prisma version. Does it still ship a native query engine? If yes, `binaryTargets` goes in the schema (BUILD-PLAN §5.2).
- [ ] Read `npx @nestjs/cli@<pin> new --help` and `npx create-next-app@<pin> --help`, and note the exact flags for Part 2 (flags change between versions).

### 1.3 Repo and team setup (settings, not code)

- [ ] Create **`evenhand`** on GitHub: public, **completely empty** (no README, licence or `.gitignore` template, since each would create a commit).
- [ ] Add B and C as collaborators, and make sure they've accepted.
- [ ] Enable Actions. Branch protection or a ruleset for `main` (require a PR, 1 review, CI passing) can be switched on right after the first push.
- [ ] Discord, before 18:00:
  - "Must `docker compose build` work offline, or only `up` after a first online build?"
  - "How should T3/T4 claims appear, given that run.py verifies only T1/T2?"
- [ ] Kickoff call booked for **18:00 UTC** sharp. Fill in names and the sleep rota (TEAM-PLAN §1, §7).
- [ ] Planning prose ready to paste at 18:00, kept **outside** the project folder: CONTRIBUTING.md / CLAUDE.md text (TEAM-PLAN §3), DATA-MODEL.md draft (BUILD-PLAN §6), ADR template.

### 1.4 B and C (while A pins versions)

- **B:** check the ridge-model worked example on paper; define the engine's input/output types on paper (TEAM-PLAN §8).
- **C:** finish the wireframes and design tokens; create one GitHub issue per TEAM-PLAN §6 row, as **drafts on paper or in a notes app**. Create the real issues after 18:00, once the repo has a first commit.

---

## Part 2: 18:00 UTC onwards (A drives; B and C on the call)

### 18:00–18:10: kickoff call (all three)
Confirm: names, sleep rota, the `.dogfood.toml` routes, the API contract (TEAM-PLAN §5), and proposed decision 63 (SPEC-CHECK §4.1).

### 18:10–18:40: A builds skeleton v0

Use the flags noted in 1.2. Every step runs **after** 18:00.

1. `mkdir evenhand && cd evenhand && git init -b main`
2. **Root:**
   - `npm init -y`, then set `"private": true`, `"workspaces": ["src/*"]` and `"engines": {"node": ">=24"}`;
   - `.nvmrc` → `24`;
   - `.editorconfig`, `.gitignore` (`node_modules`, `dist`, `.next`, `.env`, `.cache`, `coverage`), `.env.example`;
   - `LICENSE` (MIT, 2026, the team name).
3. **API:** `npx @nestjs/cli@<pin> new api --directory src/api --package-manager npm --skip-git --strict`. Use the flags as confirmed in 1.2.
4. **Web:** `npx create-next-app@<pin> src/web` with TypeScript, Tailwind, ESLint, App Router and a `src/` dir, using npm and no git init.
5. **Engine:** `src/judging-engine` with its own `package.json`, `tsconfig.json` and Jest config, plus one placeholder test so CI has something to run.
6. **Shared config:** a root `tsconfig.base.json` (`strict: true`) that all three workspaces extend; one root ESLint + Prettier config; delete the per-app duplicates the generators created.
7. **Dependencies:** install every package from BUILD-PLAN §5.1 **now**, pinned (this is why the npm cache was warmed). Commit `package-lock.json`.
8. **Root scripts:** stubs for `dev`, `check`, `gen:api`, `acceptance` and `cli` (TEAM-PLAN §3.4). `check` must run lint + typecheck + test across all workspaces.
9. **CI:** `.github/workflows/ci.yml` running `npm ci` → `npm run check` → build all workspaces.
10. **Verify:** `npm ci && npm run check && npm run build` pass on a clean install.
11. `git add -A && git commit -m "chore: skeleton v0"`, then `git remote add origin git@github.com:<org>/evenhand.git && git push -u origin main`.
12. Turn on branch protection for `main`. Post "v0 is up" in chat.

### 18:40: B and C start

- **B and C:** `git clone …`, `nvm use`, `npm ci`, `npm run check` (all green), then branch `b/…` / `c/…` and start TEAM-PLAN §6, row H0–H4.
- **C:** create the GitHub issues from the drafts (TEAM-PLAN §7).
- **A:** continue with foundation v1 (TEAM-PLAN §2.3): compose → full schema + first migration → core module → golden slice → CONTRIBUTING.md / CLAUDE.md (pasted from the prepared prose, then adjusted to the real code).

### "The basics work" at the end of v0 means:
- a fresh clone runs `npm ci && npm run check && npm run build` green on all three machines;
- CI is green on `main`;
- `npm run dev` starts the Nest app and the Next app (placeholder pages are fine).

The Docker compose stack, database, auth and the 7 checks come in foundation v1 and G1 (target H8 = 02:00 UTC Saturday).

---

## If something goes wrong in the first hour

| Problem | Do this |
|---|---|
| A generator's flags don't match | Answer its interactive prompts using the choices in steps 3–4. Don't lose 15 minutes on flags. |
| `npm install` is slow or fails | The warmed cache should prevent this. Retry with `--prefer-offline`. |
| Workspace hoisting confuses Next or Nest | Keep going with per-workspace `node_modules` (`npm install --workspaces`). Fix it in foundation v1, not v0. |
| CI fails on the first push | Merge anyway only if `npm run check` passes locally; fix CI as the next PR, before B and C open theirs. |
