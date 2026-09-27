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

## Verified

Each claim below is checked by a command anyone can run, not asserted. Numbers are from the last run and are updated when they change.

| Claim                                                            | Checked by                                                                                                                                                                                                                                               | Result                                          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| The organisers' checker passes                                   | `npm run acceptance` (official `run.py` against `docker compose up`)                                                                                                                                                                                     | 7 / 7 PASS                                      |
| Roles are enforced by the API, not the UI                        | [`tests/api/isolation.e2e-spec.ts`](tests/api/isolation.e2e-spec.ts): 29 of the API's 33 operations × 7 roles. The other four are the health check and login, registration and logout, which anyone may call                                             | 32 rows × 7 roles, 224 expected status codes    |
| A judge is refused before any lookup, so refusals leak nothing   | Same file: a real and a non-existent judge get the same 403                                                                                                                                                                                              | Pass                                            |
| The deadline holds to the millisecond, on every write            | [`tests/api/submissions.e2e-spec.ts`](tests/api/submissions.e2e-spec.ts): refused at the closing instant, 1 ms before gets through; [`drafts.e2e-spec.ts`](tests/api/drafts.e2e-spec.ts): edit and submit refused after the close and before the opening | Pass                                            |
| The audit log cannot be edited or deleted, even with SQL         | [`tests/api/constraints.e2e-spec.ts`](tests/api/constraints.e2e-spec.ts): `UPDATE`, `DELETE`, `TRUNCATE` refused                                                                                                                                         | Pass                                            |
| An organiser can read the audit trail without knowing the schema | [`tests/api/audit-log.e2e-spec.ts`](tests/api/audit-log.e2e-spec.ts): every entry has a sentence naming who and what; no tokens, hashes or IP addresses reach organisers                                                                                 | Pass                                            |
| The database and API have no route to the internet               | `docker compose exec api node -e "fetch('https://example.org').then(()=>console.log('online'),()=>console.log('offline'))"`                                                                                                                              | `offline`                                       |
| A backup restores exactly, and keeps the audit log append-only   | Backup and restore commands below, restored into a second database and compared                                                                                                                                                                          | Row counts identical; `UPDATE` on audit refused |
| An event moves out and back in unchanged                         | [`tests/api/transfer.e2e-spec.ts`](tests/api/transfer.e2e-spec.ts): exporting `evt_01` reproduces the published fixtures.json; export → `cli import` into an empty database → export is byte-identical                                                   | Pass                                            |
| An organiser can run an event from the browser                   | `npm run test:ui` ([`tests/ui`](tests/ui/)): a real Chromium logs in, creates an event, moves its deadline, adds, renames and removes a track and a prize, sees the API's error messages, and reads the result in the audit trail                        | 10 / 10 steps pass                              |
| Everything else                                                  | `npm run check`: format, lint, typecheck, unit and end-to-end tests                                                                                                                                                                                      | 56 unit + 346 end-to-end tests pass             |

The REST API is described by an OpenAPI 3 document, [`src/api/openapi.json`](src/api/openapi.json), served with Swagger UI at <http://localhost:8080/api/docs> (works offline).

## What works today, honestly

Status on Sun 27 Sep. Claims only what is tested; "API" means the pages for it are still to come.

| Area                                                                                         | Status                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| One-command start, seeded from `fixtures.json`, runs with no internet route for db and api   | ✅ done, verified                                                 |
| Acceptance checker (T1 + T2, 7 checks)                                                       | ✅ 7/7 pass                                                       |
| Auth: browser sessions (httpOnly cookie + CSRF Origin check) and bearer tokens               | ✅ done, e2e-tested                                               |
| Roles per event (participant, judge, organizer) + platform admin; deny-first 403s            | ✅ done, isolation matrix e2e-tested                              |
| Deadline enforcement: opening and closing time, server clock, both boundaries tested         | ✅ every write: submission create / edit / submit, teams, invites |
| Public gallery with search, tag filter and pagination; project pages                         | ✅ API + UI (track filter UI to come)                             |
| Judges' own scores, peer isolation, scores CSV export                                        | ✅                                                                |
| Append-only audit log (database trigger), duplicate detection on import                      | ✅                                                                |
| Readable audit trail: one sentence per entry, filters, CSV export; platform trail for admins | ✅ API + organiser page (`/organizer/events/:event/audit`)        |
| Rate limits on login / register (429)                                                        | ✅                                                                |
| First admin (`create-admin`), password reset (`reset-password`), backup and restore          | ✅ verified                                                       |
| Event export (fixtures.json shape + extras) and `cli import`; round trip tested              | ✅ API and CLI                                                    |
| Event creation and editing with dates, tracks and prizes                                     | ✅ API + organiser pages (`/organizer`), browser-tested           |
| Teams and invite links (hashed tokens, expiry, use limit)                                    | ✅ API, e2e-tested; pages to come                                 |
| Draft editing and submitting (edit until the deadline, drafts private)                       | ✅ API, e2e-tested; submission form to come                       |
| Image uploads, organiser-defined questions                                                   | ⏳ not started (tables exist)                                     |
| Judge assignment, rubric editor, judge console, progress dashboard, all-stage CSV            | ⏳ planned (T2)                                                   |
| Bias-corrected ranking, Ranking Receipt, publish, Normalization Proof                        | ⏳ planned (see [JUDGING.md](JUDGING.md))                         |
| Community voting (T3), webhooks / certificates (T4)                                          | ❌ not planned for this event                                     |

## Limitations

Written down so a reviewer does not have to find them. Features still being built are in the table above; these are limits of the design as it stands.

- **No email.** Nothing is sent: team invite links are copied and shared by hand, and there is no password-reset email. An operator resets a password with `create-admin --reset-password` (below). Sending mail would mean an SMTP server, which the offline rule excludes from the default setup.
- **No team-size limit per event.** Each invite link admits at most 4 people and expires after 7 days, but a team can issue more links. Leaving a team and removing a member are not built yet.
- **Exports carry submitted work only.** Drafts and unfinished reviews are not exported, and imported accounts have no password until an operator runs `cli reset-password`. There is no import through the web yet; it runs from the server shell.
- **Demo mode is insecure on purpose.** With `DEMO_MODE=true` (the compose default) the four test tokens and the shared password are public, so the checker and a first-time visitor can get in. [Turn it off](#running-a-real-event) for a real event.
- **No TLS in the box.** The portal serves plain HTTP on :8080. Put a reverse proxy that terminates TLS in front of it for anything beyond a laptop.
- **Per-IP rate limits can be dodged behind the bundled proxy.** Next.js passes on a client-supplied `X-Forwarded-For`; a reverse proxy in front should overwrite it ([threat model](JUDGING.md#threat-model)).
- **One machine.** One Postgres, one API and one web container. Sized for a hackathon of hundreds of people, not a platform of many concurrent events.
- **A database superuser can still rewrite history.** The audit log is append-only through triggers, which someone with superuser access can disable. Hash-chaining the log is not built.
- **Times are UTC.** Deadlines are stored and enforced in UTC by the server's clock; a client's clock is never trusted.

The reasoning behind each design choice is in the [decision records](docs/decisions/).

## Running a real event

The defaults are for a demo. For a real event, edit the `api` and `db` sections of `docker-compose.yml`:

1. `DEMO_MODE: 'false'`: the public test tokens and the shared demo password stop working.
2. `SEED_FIXTURES: 'false'`: the organisers' sample event is not imported.
3. Replace the database password `evenhand` in both `POSTGRES_PASSWORD` and `DATABASE_URL`.
4. `ALLOWED_ORIGINS`: the address people will use, e.g. `https://hack.example.org`.
5. Put a TLS-terminating reverse proxy in front of port 8080 (see [Limitations](#limitations)).

Then start it and create the first admin (a platform admin has organiser rights on every event):

```sh
docker compose up -d
docker compose exec api node dist/cli/cli.js create-admin you@example.org --name "Your Name"
```

To bring in an event from another portal (any file in the fixtures.json shape, including an Evenhand export), see [DATA-MODEL.md → Import](DATA-MODEL.md#import-way-in); people it creates get their passwords from `cli reset-password <email>`.

The password is printed once; store it. Run the same command on an existing account to make it an admin (its password is kept), or add `--reset-password` to issue a new one. Every grant is written to the audit log.

## Backup and restore

The whole portal state is the Postgres database. Back it up while running:

```sh
docker compose exec -T db pg_dump -U evenhand -d evenhand --format=custom > evenhand.dump
```

Restore onto a fresh stack (this **wipes** the current data):

```sh
docker compose down -v            # deletes the database volume
docker compose up -d --wait db
docker compose exec -T db pg_restore -U evenhand -d evenhand --no-owner < evenhand.dump
docker compose up -d
```

The restored database keeps its migration history and its append-only audit log. Uploaded files live in the `uploads` volume; back that up too once uploads are in use.

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
| `npm run test:ui`     | Click through the organiser pages in a real browser against the running stack        |

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
