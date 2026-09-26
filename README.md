# Evenhand

A self-hostable hackathon submission and judging portal whose rankings come with receipts.
Built for [DOGFOOD 2026](https://dogfoodhack.com): "build the platform that will judge you".

- **Teams** submit projects to a public gallery until a deadline that actually holds.
- **Judges** score against a weighted rubric and cannot see each other's work. That is enforced by the API, not hidden in the UI.
- **Organisers** follow progress, export CSV, and (in progress) publish rankings corrected for harsh and generous judges, with an audit log behind every step.

Everything runs on your own machine, with the network off. No accounts, no hosted services.

---

## Quick start

You need Docker (Docker Desktop, OrbStack or Docker Engine with Compose v2). Nothing else.

```sh
docker compose up
```

The first run builds the images (about 3–4 minutes, and the only step that needs the internet). After that, the portal starts in about 15 seconds, fully offline:

| What                            | Where                            |
| ------------------------------- | -------------------------------- |
| Portal                          | <http://localhost:8080>          |
| Public gallery                  | <http://localhost:8080/projects> |
| API docs (OpenAPI / Swagger UI) | <http://localhost:8080/api/docs> |

On every start the API applies database migrations, imports the organisers' `fixtures.json` (41 projects, 30 judges, 8 tracks, 126 reviews; safe to repeat) and prints the test logins:

```
seeded. test logins (DEMO_MODE=true: demo only, never use in production):
  organizer    Authorization: Bearer dev-organizer-7f2a    (organizer@evenhand.local)
  judge_a      Authorization: Bearer dev-judge-a-91bc      (jdg_24 Diego Herrera)
  judge_b      Authorization: Bearer dev-judge-b-44de      (jdg_26 Jonas Vogel)
  participant  Authorization: Bearer dev-participant-2e88  (priya1@example.org)
```

Every seeded account can also log in through the web UI with the password **`evenhand-demo`**, e.g. `organizer@evenhand.local`, `diego.herrera@example.org` (judge), `priya1@example.org` (participant) or `admin@evenhand.local`.

> **Demo mode.** The fixed tokens and shared password exist so the acceptance checker and a first-time visitor can get in straight away. They only work while `DEMO_MODE=true` (the compose default). Set `DEMO_MODE: 'false'` in `docker-compose.yml` for a real event: the demo tokens are then refused.

Try it with curl:

```sh
curl localhost:8080/api/projects                                                  # public gallery
curl -H 'Authorization: Bearer dev-judge-a-91bc' localhost:8080/api/judge/scores  # a judge's own scores
curl -H 'Authorization: Bearer dev-judge-b-44de' localhost:8080/api/judges/jdg_24/scores  # 403: not yours
```

To start again from an empty database: `docker compose down -v && docker compose up`.

## Acceptance report

```sh
npm run acceptance            # builds + starts the stack, runs the organisers' run.py
SKIP_UP=1 npm run acceptance  # against a stack that is already running
```

The result is written to [`acceptance-report.txt`](acceptance-report.txt). The script downloads the official `run.py` into `.cache/` (it isn't ours, so it isn't committed) and reuses the cached copy when offline. Routes and test headers are in [`.dogfood.toml`](.dogfood.toml).

## What works today, honestly

Status at the end of the bootstrap (Sat 26 Sep). Claims only what is tested.

| Area                                                                                       | Status                                        |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- |
| One-command start, seeded from `fixtures.json`, runs with no internet route for db and api | ✅ done, verified                             |
| Acceptance checker (T1 + T2, 7 checks)                                                     | ✅ 7/7 pass                                   |
| Auth: browser sessions (httpOnly cookie + CSRF Origin check) and bearer tokens             | ✅ done, e2e-tested                           |
| Roles per event (participant, judge, organizer) + platform admin; deny-first 403s          | ✅ done, isolation matrix e2e-tested          |
| Deadline enforcement (server clock, exact boundary tested)                                 | ✅ on create; edit / submit / uploads to come |
| Public gallery with search, tag filter and pagination; project pages                       | ✅ API + UI (track filter UI to come)         |
| Judges' own scores, peer isolation, scores CSV export                                      | ✅                                            |
| Append-only audit log (database trigger), duplicate detection on import                    | ✅ written; audit page to come                |
| Rate limits on login / register (429)                                                      | ✅                                            |
| Teams + invite links, draft editing, custom questions, event / track / prize admin         | ⏳ next (T1 breadth)                          |
| Judge assignment, rubric editor, judge console, progress dashboard, all-stage CSV          | ⏳ planned (T2)                               |
| Bias-corrected ranking, Ranking Receipt, publish, Normalization Proof                      | ⏳ planned (see [JUDGING.md](JUDGING.md))     |
| Community voting (T3), webhooks / certificates (T4)                                        | ❌ not planned for this event                 |

Known limits are listed in [JUDGING.md → Threat model](JUDGING.md#threat-model) and the [decision records](docs/decisions/).

## Development

Requirements: Node 24 (`nvm use`), npm 10+, Docker.

```sh
cp .env.example .env   # local settings (Postgres on host port 5433)
npm install
npm run dev            # Postgres in Docker; engine, api (:3001) and web (:3000) with hot reload
```

`npm run dev` migrates and seeds the database on start. Open <http://localhost:3000>.

| Command               | What it does                                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`         | Postgres in Docker + engine, api and web in watch mode                               |
| `npm run check`       | Format check, lint, typecheck, unit tests, e2e tests. **Must pass before every PR.** |
| `npm test`            | Unit tests (no database)                                                             |
| `npm run test:e2e`    | API end-to-end tests against a throwaway `evenhand_test` database                    |
| `npm run gen:api`     | Regenerate `src/api/openapi.json` and the web's typed client                         |
| `npm run cli -- seed` | Import fixtures + demo data (idempotent)                                             |
| `npm run db:reset`    | Drop and recreate the dev database, then seed                                        |
| `npm run acceptance`  | Run the organisers' checker against the Docker stack                                 |

How to contribute (layout, rules, review, ownership) is in **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Repository layout

```
src/api             NestJS API: every permission, deadline and audit rule
src/web             Next.js UI: a client of the API, never the security boundary
src/judging-engine  Pure TypeScript judging maths (no I/O), unit-tested on its own
tests/              End-to-end suites (tests/api) and the acceptance runner
data/fixtures.json  The organisers' fixture data, loaded on every boot
docker/             Dockerfiles and the api entrypoint
docs/decisions/     Architecture decision records (one file per decision)
docs/planning/      The pre-build plans this implementation follows
```

Design: [ARCHITECTURE.md](ARCHITECTURE.md) · Schema, import and export: [DATA-MODEL.md](DATA-MODEL.md) · Scoring, normalization and threat model: [JUDGING.md](JUDGING.md)

## Troubleshooting

| Symptom                                              | Fix                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` for 8080                 | Something else uses 8080. Stop it, or change `'8080:8080'` to e.g. `'8081:8080'` in `docker-compose.yml` (and `base_url` in `.dogfood.toml`). |
| Old data or a failed migration after pulling changes | `docker compose down -v && docker compose up --build` (wipes the local database).                                                             |
| `npm run dev` cannot reach Postgres                  | `npm run db:up`. Check that nothing else uses host port 5433.                                                                                 |
| Changed code but Docker shows the old version        | `docker compose up --build`                                                                                                                   |

## AI use

Built with Claude Code. The humans on the team own the design decisions in [docs/decisions](docs/decisions/) and [docs/planning](docs/planning/), review every change, and can defend the schema and the maths in writing. AI output is reviewed like any other code.

## License

[MIT](LICENSE)
