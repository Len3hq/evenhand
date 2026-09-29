# Architecture

Evenhand is three containers behind one public port. The API owns every rule; the web app is one of its clients; the judging maths is a pure library the API calls.

```
           browser                     curl / run.py / scripts
              │ cookie: session              │ Authorization: Bearer <token>
              ▼                              ▼
 ┌──────────────────────────────── edge network ───────────────────────────────┐
 │  web  :8080   Next.js 16 (standalone server)  ── the only published port     │
 │               pages render on the server; /api/* is proxied to the api       │
 └───────────────┬─────────────────────────────────────────────────────────────┘
                 │  backend network (internal: no route to the internet)
 ┌───────────────▼─────────────────────────────────────────────────────────────┐
 │  api  :3001   NestJS 12                                                      │
 │    ThrottlerGuard → SessionGuard → RoleGuard → route guards → ValidationPipe │
 │    controllers (thin) → services (permission → deadline → write+audit → DTO) │
 │    @evenhand/judging-engine (pure TS)       Prisma 7 client (pg adapter)     │
 │  db   :5432   PostgreSQL 16 (volume pgdata)                                  │
 └──────────────────────────────────────────────────────────────────────────────┘
```

## Why this shape

Each decision below links to its record where one exists; all of them are in [`docs/decisions/`](docs/decisions/), one file per decision, written when it was made.

| Decision                                                    | Reason                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **One origin** (`:8080`; Next rewrites `/api/*` to the API) | Cookies are same-origin (no CORS), and the browser, curl and the checker all use one `base_url`.                                                                                                                                                                               |
| **API as the only authority**                               | "If I can curl another judge's scores, it is not isolation." Every permission is enforced in API services, so the UI cannot get it wrong.                                                                                                                                      |
| **`db` and `api` on an internal network**                   | "No external API at runtime" is guaranteed by construction: the API cannot reach the internet even if someone adds code that tries. Verified: an egress attempt from the api container fails with `EAI_AGAIN`, and the stack still boots, migrates, seeds and passes `run.py`. |
| **Pure judging engine** (`src/judging-engine`)              | The part that decides who wins is deterministic, has no dependencies and is unit-tested without a database. It can be reviewed, and reused in a verify CLI, on its own.                                                                                                        |
| **NestJS + Next.js + Prisma**                               | The team's strongest stack ([ADR](docs/decisions/20260926-1300-a-stack-nestjs-nextjs.md)). Nest's guards and modules suit layered authorisation; Next renders pages on the server.                                                                                             |

## Request pipeline

Every API request passes the same layers, in this order (registered in `core/core.module.ts`):

1. **ThrottlerGuard**: per-IP rate limits, each a named counter (`core/core.module.ts`): `default` (300/min) everywhere except image downloads; `auth` (10/min) for login and register; `export` (30/min, one counter across every CSV and the event JSON); `review` (120/min, judge saves and submits); `upload` (30/min, image uploads, each re-encoded); `image` (3000/min, image downloads, many per gallery page). Over a limit → 429, audited once a minute per address for admins.
2. **SessionGuard**: resolves the caller from `Authorization: Bearer` (hashed `api_tokens`) or the `session` cookie (hashed `sessions`) into an `Actor` with all their event roles.
   - Cookie-authenticated **writes** must carry an allowed `Origin` (or `Referer`): the CSRF defence. Bearer tokens are exempt; they are not ambient credentials.
   - Demo tokens are refused unless `DEMO_MODE=true`.
   - Non-public route with no valid caller → **401 JSON**. There are no redirects anywhere under `/api`.
3. **RoleGuard**: `@RequireRole('JUDGE')` etc.; the caller must hold the role in _some_ event. Wrong role → 403.
4. **Route guards**: `SubmissionsOpenGuard` resolves `:eventRef` and refuses with **403 `submissions_closed`** once `now ≥ submissions_close`; `EditableSubmissionGuard` checks the team, the deadline and the duplicate state for image writes. Guards run before pipes and interceptors, so a closed event refuses before the body is validated, and a stranger's upload is refused before a byte of it is read.
5. **ValidationPipe**: DTO validation; unknown fields rejected (400).
6. **Service**: permission for _this_ event or object (**deny first**: decided from the actor before querying the object), deadline again where relevant, then the write and its audit row in one transaction, then a DTO. The one exception is serving an image, which is public exactly when its project is, so the image is looked up first ([ADR](docs/decisions/20260928-1500-a-image-uploads.md)).
7. **AllExceptionsFilter**: every error becomes `{ statusCode, error, message }`; unexpected errors are logged and answered with a generic 500.

### Deny first, concretely

`GET /api/judges/:judgeRef/scores`, as judge B asking for judge A:

- The caller is not that judge and is not an organiser anywhere → **403 immediately**. The database is never asked whether `jdg_24` exists, so the answer for a real judge and a made-up one is byte-identical (tested).
- The caller is an organiser → the judge is looked up; allowed only if the caller organises _that judge's_ event (an organiser of another event gets 403, tested).

## API modules

Each module under `src/api/src/modules/` is a controller (thin), a service (the rules) and its DTOs; `core/` holds what they share (guards, `Actor`, `Clock`, audit, errors, config, Prisma, CSV, paging).

| Module        | Owns                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `auth`        | Register, log in and out, `me`; sessions (cookie) and bearer tokens                                                     |
| `events`      | Events, tracks, prizes, organisers, custom questions                                                                    |
| `teams`       | Teams, invite links, joining                                                                                            |
| `submissions` | Drafts, editing until the deadline, submitting, answers                                                                 |
| `images`      | Uploading, re-encoding, ordering and serving project images                                                             |
| `gallery`     | The public gallery and project pages                                                                                    |
| `judges`      | Judge invite links, judges' tracks, removal                                                                             |
| `judging`     | The rubric, assignment, the judge console (reviews), progress, judges' scores and the scores CSV; the "in judging" rule |
| `rankings`    | Ranking runs with their receipts, publishing, public results, results CSV                                               |
| `comments`    | Comments on public projects, and their moderation (hide with a reason, restore)                                         |
| `integrity`   | Suspected duplicates (confirm, dismiss, reopen), disqualification, the entries list                                     |
| `audit`       | The readable event and platform trails, audit CSV                                                                       |
| `exports`     | Teams, submissions and assignments CSVs                                                                                 |
| `transfer`    | The event export in the fixtures.json shape                                                                             |
| `health`      | `/api/healthz` (checks the database)                                                                                    |

The command line (`src/api/src/cli/`) uses the same modules and rules: `seed`, `import`, `export-event`, `create-admin`, `reset-password`, `tokens`, `openapi`.

## Start-up (api container)

`docker/api-entrypoint.sh`:

1. `prisma migrate deploy`, retried up to 10× (compose already waits for the db healthcheck; the retry covers the last gap).
2. `node dist/cli/cli.js seed`: imports `data/fixtures.json` (idempotent: finds before it creates) and, in demo mode, the demo accounts, the open demo event and fixed tokens; prints the logins. Skipped when `SEED_FIXTURES=false`, as for a real event.
3. `exec node dist/main.js`.

A real deployment has no default admin and no default password. The first admin is created from the server's shell with `cli create-admin` (README, "Running a real event"): whoever can run commands in the container already controls the database, so the shell is the one place a bootstrap credential adds no new attack surface. API tokens for scripts are issued and revoked the same way (`cli tokens`).

`web` starts only when `api` reports healthy (`/api/healthz` checks the database).

## Offline and reproducible builds

- Base images are pinned by **multi-arch digest** (amd64 + arm64).
- Network is used only while building (`npm ci`, `apt-get openssl`). At runtime nothing calls out: fonts are bundled (Inter, Manrope and JetBrains Mono from npm's `@fontsource-variable` packages, SIL OFL 1.1, served from the portal's own origin; never a font service), no image optimiser (`images.unoptimized`), telemetry off (`NEXT_TELEMETRY_DISABLED`, and `CHECKPOINT_DISABLE` for the Prisma CLI that migrates on every start), no CDN (Swagger UI assets are served locally), and the browser is held to the same origin by the Content-Security-Policy.
- **The offline drill** (`npm run drill`, `tests/offline/drill.sh`) proves it end to end: a fresh clone is built, then started on empty volumes with every network internal (`tests/offline/offline.compose.yml`); a request to the internet must fail from the api and from the web container's network, and the organisers' `run.py` and every browser check then run inside that network, where `localhost:8080` is the portal and nothing else is reachable.
- Image uploads are re-encoded by sharp in the api. Its libvips is a prebuilt binary for each architecture, installed by `npm ci` with the image; nothing is compiled or downloaded at runtime, and the drill uploads an image with the network cut ([ADR](docs/decisions/20260928-1500-a-image-uploads.md)).
- Prisma: the CLI is a runtime dependency (never fetched with `npx`), the client is generated at build time, and the Dockerfile **fails the build** if the schema engine for the runtime's OpenSSL is missing. Otherwise the container would try to download one at start-up. We hit exactly this bug once (details in the Dockerfile).
- `next build` needs neither the API nor the database: data pages are rendered per request.

## Configuration

Environment variables, validated at start-up (`core/config.ts`; a bad value stops the process with a clear message):

| Variable                                                  | Default                       | Meaning                                                                                                                                               |
| --------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                            | – (required)                  | Postgres connection string                                                                                                                            |
| `PORT`                                                    | `3001`                        | API port                                                                                                                                              |
| `DEMO_MODE`                                               | `false` (compose sets `true`) | Seed demo tokens and passwords, and accept demo tokens                                                                                                |
| `DEMO_PASSWORD`                                           | `evenhand-demo`               | Password of every seeded account in demo mode                                                                                                         |
| `ALLOWED_ORIGINS`                                         | `http://localhost:8080`       | Origins allowed to make cookie-authenticated writes                                                                                                   |
| `RATE_LIMIT_DEFAULT_PER_MIN` / `RATE_LIMIT_LOGIN_PER_MIN` | `300` / `10`                  | Per-IP limits                                                                                                                                         |
| `RATE_LIMIT_EXPORT_PER_MIN` / `RATE_LIMIT_REVIEW_PER_MIN` | `30` / `120`                  | Exports (all CSVs and the event JSON, one counter) and judge review writes, per IP                                                                    |
| `RATE_LIMIT_COMMENT_PER_MIN`                              | `10`                          | Comments posted per IP                                                                                                                                |
| `RATE_LIMIT_UPLOAD_PER_MIN` / `RATE_LIMIT_IMAGE_PER_MIN`  | `30` / `3000`                 | Image uploads (each is re-encoded), and image downloads, which have their own limit instead of the default one (a gallery page loads many thumbnails) |
| `AUTH_FAILURES_PER_MIN`                                   | `20`                          | Failed token or session checks per IP before it is refused (429) for the rest of the minute                                                           |
| `SESSION_TTL_HOURS`                                       | `168`                         | Browser session lifetime                                                                                                                              |
| `UPLOADS_DIR`                                             | `./uploads`                   | Re-encoded project images (volume `uploads` in Docker)                                                                                                |
| `FIXTURES_PATH`                                           | `data/fixtures.json`          | Used by `cli seed` when `--fixtures` is not given                                                                                                     |
| `SEED_FIXTURES` (api container)                           | `true`                        | Import `fixtures.json` on start; `false` for a real event                                                                                             |
| `API_REWRITE_TARGET` (web, **build time**)                | `http://localhost:3001`       | Where Next proxies `/api/*`. Rewrites are fixed at build time.                                                                                        |
| `API_INTERNAL_URL` (web, run time)                        | `http://localhost:3001`       | Where server components call the API                                                                                                                  |

## Testing

| Layer      | Where                                                         | What                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | `src/**/**.spec.ts` (Vitest)                                  | Engine maths (on synthetic events and the fixtures), fixture parsing, duplicate detection, deadline boundary, rubric and question rules, audit sentences                              |
| End-to-end | `tests/api/*.e2e-spec.ts` (Vitest + supertest, real Postgres) | The **isolation matrix** (7 actors × every protected route), cookie/CSRF/demo-mode/rate-limit behaviour, deadline with a frozen clock, hand-written SQL constraints, seed idempotency |
| Acceptance | `tests/acceptance/run.sh`                                     | The organisers' `run.py` against the Docker stack                                                                                                                                     |
| Browser    | `tests/ui/run.sh`                                             | Playwright's Chromium clicks through every `tests/ui/*.check.mjs` (accounts, gallery, participants, organiser pages) on the Docker stack (`npm run test:ui`)                          |
| Offline    | `tests/offline/drill.sh`                                      | Fresh clone, empty volumes, network cut and proven cut, then acceptance and browser checks inside the stack's network (`npm run drill`)                                               |

`npm run check` runs everything except acceptance, the browser checks and the drill; CI runs all of them.

## Known trade-offs

- **Rate limiting trusts `X-Forwarded-For` from private-range proxies.** Next's proxy keeps a client-supplied `X-Forwarded-For`, so a client can rotate that header to dodge per-IP limits. For a public deployment, put a reverse proxy in front that overwrites it (see the [threat model](JUDGING.md#threat-model)).
- **Rate-limit counters are in memory**: correct for one API instance; several instances would need a shared store.
- **Addresses in the admin trail are what the api sees.** Behind the bundled proxy alone that is the proxy's or Docker's address; a reverse proxy that sets `X-Forwarded-For` makes them the visitors' own.
- **Image files and their rows are written in two steps.** Files are written first and removed if the database write fails; if the server stops in between, the files stay unused (never served, since serving starts from the row).
- **ESLint 9 is end-of-life**, but Next's lint plugins do not support ESLint 10 yet ([ADR](docs/decisions/20260926-1330-a-dependency-pins.md)).
