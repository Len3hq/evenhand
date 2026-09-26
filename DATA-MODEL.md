# Data model

The schema lives in [`src/api/prisma/schema.prisma`](src/api/prisma/schema.prisma). This document explains it, and the two must change together. Tables and columns are `snake_case` in SQL; primary keys are **UUIDv7** (time-ordered, index-friendly). Rows that came from `fixtures.json` keep the fixture id in `external_id`, so exports, routes and the checker's URLs line up with the organisers' data.

## Entities

```
users ─┬─ sessions            (browser logins; token hash only)
       ├─ api_tokens          (bearer tokens; hash only; is_demo)
       ├─ event_roles ──┬─ judge_tracks ── tracks
       │   (PARTICIPANT │  (which tracks a judge may see)
       │    JUDGE        ├─ assignments ── reviews ── criterion_scores ── criteria
       │    ORGANIZER)   └─ conflicts_of_interest ── teams
       └─ team_members ── teams ── submissions ─┬─ submission_images
                                                ├─ answers ── custom_questions
                                                ├─ duplicate_flags (kept / superseded)
                                                └─ ranking_rows ── ranking_runs
events ── tracks, prizes, criteria, teams, submissions, ranking_runs, audit_log
audit_log (append-only)
```

| Table                                              | Purpose                                                                             | Key constraints                                                                                                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                            | People. `is_admin` = platform administrator                                         | `email` unique (stored lower-cased); password is argon2id or NULL                                                                                               |
| `sessions`                                         | Browser sessions                                                                    | `token_hash` unique (SHA-256 of a 256-bit random cookie value)                                                                                                  |
| `api_tokens`                                       | Bearer tokens for scripts and the checker                                           | `token_hash` unique; `is_demo` tokens refused unless `DEMO_MODE=true`; `revoked_at`                                                                             |
| `events`                                           | A hackathon                                                                         | `slug` unique, `external_id` unique; `submissions_close` is the deadline                                                                                        |
| `tracks`, `prizes`                                 | Per event; a prize may belong to a track                                            | `(event_id, external_id)` and `(event_id, name)` unique                                                                                                         |
| `event_roles`                                      | **Roles are per event**: the same person can judge one event and compete in another | `(user_id, event_id, role)` unique; judges keep their fixture id (`jdg_24`) in `external_id`                                                                    |
| `judge_tracks`                                     | Track isolation: what a judge may see                                               | PK `(judge_role_id, track_id)`                                                                                                                                  |
| `criteria`                                         | The weighted rubric                                                                 | `(event_id, key)` unique; CHECK `min ≤ max`, CHECK `weight ≥ 0`                                                                                                 |
| `teams`, `team_members`                            | Teams                                                                               | `team_members.event_id` is denormalised so the database enforces **one team per user per event** with a plain unique `(event_id, user_id)`                      |
| `invites`                                          | Invite links                                                                        | `token_hash` unique; `max_uses`, `expires_at`                                                                                                                   |
| `submissions`                                      | Projects                                                                            | `(event_id, external_id)` unique; **one live submission per team per event** (partial unique index, below); `seed_order` = position in fixtures.json            |
| `submission_images`, `custom_questions`, `answers` | The reference field set + organiser questions                                       | `answers` PK `(submission_id, question_id)`                                                                                                                     |
| `duplicate_flags`                                  | Suspected duplicates awaiting a decision                                            | `(kept_id, superseded_id)` unique; `reason` SAME_TEAM / SAME_REPO / SAME_TITLE; `status` PENDING / CONFIRMED / DISMISSED                                        |
| `conflicts_of_interest`                            | Judge × team pairs that must never be assigned                                      | PK `(judge_role_id, team_id)`                                                                                                                                   |
| `assignments`                                      | A judge's queue                                                                     | `(judge_role_id, submission_id)` unique; `batch`, `queue_position`                                                                                              |
| `reviews`                                          | One per assignment                                                                  | `assignment_id` unique; `status` DRAFT / FINAL; `superseded` for merged duplicates; `submitted_at` NULL for imported reviews (the fixtures carry no timestamps) |
| `criterion_scores`                                 | Raw per-criterion values                                                            | PK `(review_id, criterion_id)`; value inside the criterion's range (trigger)                                                                                    |
| `ranking_runs`, `ranking_rows`                     | A frozen ranking computation, the "Ranking Receipt" (B, in progress)                | Parameters, inputs hash, output hash                                                                                                                            |
| `audit_log`                                        | Who did what, when, with before/after                                               | **Append-only** (trigger); FKs are `RESTRICT`                                                                                                                   |

## Constraints the database enforces

Prisma's schema language cannot express some rules, so they are hand-written SQL in [`migrations/*_hand_written_constraints`](src/api/prisma/migrations/). Each has an e2e test ([`tests/api/constraints.e2e-spec.ts`](tests/api/constraints.e2e-spec.ts)) proving it fires. `prisma migrate diff` shows no drift, so future `migrate dev` runs do not drop them (checked).

| Rule                                       | How                                                                                                             | Why in the database                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| One live submission per team per event     | Partial unique index on `submissions (event_id, team_id) WHERE superseded_by_id IS NULL AND NOT duplicate_hold` | A race between two tabs cannot create two entries                                                                  |
| The audit log cannot be edited             | Triggers raise on `UPDATE`, `DELETE` and `TRUNCATE` of `audit_log`                                              | "Append-only" should not depend on every future line of code behaving                                              |
| Scores stay inside their criterion's range | Trigger on `criterion_scores` looks up `criteria.min/max`                                                       | A bad import or a bug cannot store a 9 on a 1–5 scale                                                              |
| Sane rubric                                | CHECK `min ≤ max`, CHECK `weight ≥ 0`                                                                           | –                                                                                                                  |
| History is never silently lost             | `audit_log` FKs are `ON DELETE RESTRICT`                                                                        | A cascade would UPDATE audit rows, which the trigger forbids; users and events with history are never hard-deleted |

## Duplicates (the Dry Harbour case)

The fixtures contain one duplicate: "Dry Harbour", team `tm_07`, submitted as `prj_07` (04:29) and `prj_41` (17:57, 3 minutes before close). The team decided: **flag, keep the latest, let the organiser confirm** ([ADR](docs/decisions/20260926-1315-a-duplicate-hold.md)).

On import:

1. Both rows are created and **both stay visible** in the gallery (the checker must still find fixture titles, and nothing is decided silently).
2. The earlier copy gets `duplicate_hold = true`, which takes it out of the one-live-per-team index while the decision is pending.
3. A `duplicate_flags` row (SAME_TEAM, PENDING, kept = `prj_41`) is created and audited.

Confirming (B, next) sets `prj_07.superseded_by_id = prj_41`, moves the reviews unique to `prj_07` across (recording `original_submission_id`), and marks the overlapping judges' reviews on `prj_07` as `superseded`, so no judge is counted twice and jdg_01's only score survives.

## Fixture import

`cli seed` (run on every boot) maps [`data/fixtures.json`](data/fixtures.json) as follows. It is **idempotent**: every row is looked up by its natural or fixture key and only created when missing, so a reboot changes nothing and never overwrites what an organiser has changed since.

| fixtures.json                     | Becomes                                                                                            |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| `event`                           | `events` (`external_id` = `evt_01`, the fixture deadline kept as is: it is in the past on purpose) |
| `tracks[]`                        | `tracks`                                                                                           |
| `judges[]`                        | `users` (by email) + `event_roles` JUDGE (`external_id` = `jdg_…`) + `judge_tracks`                |
| `teams[].members`                 | `users` (name derived from the email) + `team_members` + `event_roles` PARTICIPANT                 |
| `projects[]`                      | `submissions` (SUBMITTED, `seed_order` = file position) + `duplicate_flags`                        |
| `scores[]`                        | `assignments` (batch `fixture`) + `reviews` (FINAL) + `criterion_scores`                           |
| union of `scores[].criteria` keys | `criteria`: functionality, quality, innovation, equal weights, range 1–5                           |

Result on the published file: 1 event, 8 tracks, 3 criteria, 121 users, 30 judges, 40 teams, 91 memberships, **41** submissions (40 projects + the duplicate), 126 assignments and reviews, 1 duplicate flag. The parser checks every reference (unknown judge, team, track or project) and reports all problems at once.

In demo mode the seed also creates `organizer@evenhand.local`, `admin@evenhand.local`, an open demo event (`evenhand-demo`, closes 7 days after first boot) with a team for the demo participant, and the four fixed checker tokens.

## Export (ways out)

| Export                                                      | Route                                                   | Status     |
| ----------------------------------------------------------- | ------------------------------------------------------- | ---------- |
| Every review, one row per review, one column per criterion  | `GET /api/events/:event/export/scores.csv` (organisers) | ✅         |
| Registrations, teams, submissions, assignments, results CSV | `/api/events/:event/export/*.csv`                       | ⏳ planned |
| Whole event in the fixtures.json shape (round trip)         | `cli export-event`                                      | ⏳ planned |

CSV rules: UTF-8 without a BOM, a multi-column header, RFC 4180 quoting, `\n` line endings, stable row order (judge, then project in fixture order). Fixture ids are used when present, so a CSV can be joined back to `fixtures.json`.
