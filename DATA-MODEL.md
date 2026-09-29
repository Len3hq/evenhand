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

| Table                          | Purpose                                                                                                                                                       | Key constraints                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                        | People. `is_admin` = platform administrator                                                                                                                   | `email` unique (stored lower-cased); password is argon2id or NULL                                                                                                                                            |
| `sessions`                     | Browser sessions                                                                                                                                              | `token_hash` unique (SHA-256 of a 256-bit random cookie value)                                                                                                                                               |
| `api_tokens`                   | Bearer tokens for scripts and the checker                                                                                                                     | `token_hash` unique; `is_demo` tokens refused unless `DEMO_MODE=true`; `revoked_at`                                                                                                                          |
| `events`                       | A hackathon                                                                                                                                                   | `slug` unique, `external_id` unique; `submissions_close` is the deadline                                                                                                                                     |
| `tracks`, `prizes`             | Per event; a prize may belong to a track                                                                                                                      | `(event_id, external_id)` and `(event_id, name)` unique                                                                                                                                                      |
| `event_roles`                  | **Roles are per event**: the same person can judge one event and compete in another                                                                           | `(user_id, event_id, role)` unique; judges keep their fixture id (`jdg_24`) in `external_id`                                                                                                                 |
| `judge_tracks`                 | Track isolation: what a judge may see                                                                                                                         | PK `(judge_role_id, track_id)`                                                                                                                                                                               |
| `criteria`                     | The weighted rubric                                                                                                                                           | `(event_id, key)` unique; CHECK `min ≤ max`, CHECK `weight ≥ 0`                                                                                                                                              |
| `teams`, `team_members`        | Teams                                                                                                                                                         | `team_members.event_id` is denormalised so the database enforces **one team per user per event** with a plain unique `(event_id, user_id)`                                                                   |
| `invites`                      | Invite links                                                                                                                                                  | `token_hash` unique; `max_uses`, `expires_at`                                                                                                                                                                |
| `judge_invites`                | Judge invite links for an event, with the tracks the judge will cover                                                                                         | `token_hash` unique (SHA-256 of the link's secret); CHECK `1 <= max_uses <= 50` and `0 <= uses <= max_uses`                                                                                                  |
| `submissions`                  | Projects                                                                                                                                                      | `(event_id, external_id)` unique; **one live submission per team per event** (partial unique index, below); `seed_order` = position in fixtures.json; `thumbnail_url` is no longer read (the cover image is) |
| `submission_images`            | The reference field set's thumbnail and image gallery: images a team uploaded, re-encoded by the API ([ADR](docs/decisions/20260928-1500-a-image-uploads.md)) | ordered by `order` (the first is the cover); CHECK `order >= 0` and width and height in 1–1600; files `<id>.webp` and `<id>-thumb.webp` in `UPLOADS_DIR`                                                     |
| `custom_questions`, `answers`  | Organiser questions and each submission's answers (T1 field set)                                                                                              | `(event_id, external_id)` unique; `is_public` decides whether answers reach the gallery; `answers` PK `(submission_id, question_id)`; blank answers are deleted                                              |
| `comments`                     | Comments on public projects (T3) ([ADR](docs/decisions/20260929-0937-a-comments.md))                                                                          | ordered by `created_at`; hidden ones are kept with `hidden_at`, `hidden_by_id` and `hide_reason`, never deleted; CHECK body 1–2,000 characters and not blank; CHECK a hider only on a hidden comment         |
| `voting_rounds`                | An event's community vote (T3) ([ADR](docs/decisions/20260929-1013-a-community-voting.md)): mode, window, votes per voter                                     | `event_id` unique (one vote per event); `link_token_hash` unique, the shared link's SHA-256; `results_published_at`                                                                                          |
| `voter_passes`                 | Personal voting links (email list, or taken from the shared link)                                                                                             | `token_hash` unique; `(round_id, email)` unique; `ip` only for shared-link passes, never sent to the web                                                                                                     |
| `ballots`, `votes`             | A voter's ballot and the projects it backs                                                                                                                    | `ballots (round_id, user_id)` and `pass_id` unique: one ballot per account and per link; `votes` PK `(ballot_id, submission_id)`: one vote per project                                                       |
| `duplicate_flags`              | Suspected duplicates awaiting a decision                                                                                                                      | `(kept_id, superseded_id)` unique; `reason` SAME_TEAM / SAME_REPO / SAME_TITLE; `status` PENDING / CONFIRMED / DISMISSED                                                                                     |
| `conflicts_of_interest`        | Judge × team pairs that must never be assigned                                                                                                                | PK `(judge_role_id, team_id)`                                                                                                                                                                                |
| `assignments`                  | A judge's queue                                                                                                                                               | `(judge_role_id, submission_id)` unique; `batch`, `queue_position`                                                                                                                                           |
| `reviews`                      | One per assignment                                                                                                                                            | `assignment_id` unique; `status` DRAFT / FINAL; `superseded` for merged duplicates; `submitted_at` NULL for imported reviews (the fixtures carry no timestamps)                                              |
| `criterion_scores`             | Raw per-criterion values                                                                                                                                      | PK `(review_id, criterion_id)`; value inside the criterion's range (trigger)                                                                                                                                 |
| `ranking_runs`, `ranking_rows` | A frozen ranking computation, the "Ranking Receipt"                                                                                                           | Parameters, inputs hash, output hash                                                                                                                                                                         |
| `audit_log`                    | Who did what, when, with before/after                                                                                                                         | **Append-only** (trigger), **hash-chained** (`prev_hash`, `hash`, head in `audit_chain_head`); FKs are `RESTRICT`                                                                                            |

## Constraints the database enforces

Prisma's schema language cannot express some rules, so they are hand-written SQL in [`migrations/*_hand_written_constraints`](src/api/prisma/migrations/) and at the end of the migration that adds the feature they guard (`*_judge_invites`, `*_custom_questions`, `*_submission_image_files`, `*_comments`, `*_community_voting`). Each has an e2e test ([`tests/api/constraints.e2e-spec.ts`](tests/api/constraints.e2e-spec.ts)) proving it fires. `prisma migrate diff` shows no drift, so future `migrate dev` runs do not drop them (checked).

| Rule                                              | How                                                                                                                                                                                    | Why in the database                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| One live submission per team per event            | Partial unique index on `submissions (event_id, team_id) WHERE superseded_by_id IS NULL AND NOT duplicate_hold`                                                                        | A race between two tabs cannot create two entries                                                                           |
| The audit log cannot be edited                    | Triggers raise on `UPDATE`, `DELETE` and `TRUNCATE` of `audit_log`                                                                                                                     | "Append-only" should not depend on every future line of code behaving                                                       |
| The audit log is tamper-evident                   | A `BEFORE INSERT` trigger sets `prev_hash` (the head's hash, from the one-row `audit_chain_head`, locked `FOR UPDATE`) and `hash` = SHA-256 of the entry's canonical JSON; both unique | Every code path gets it, and an edit, deletion or truncation made with the triggers off is found by `GET /api/audit/verify` |
| Scores stay inside their criterion's range        | Trigger on `criterion_scores` looks up `criteria.min/max`                                                                                                                              | A bad import or a bug cannot store a 9 on a 1–5 scale                                                                       |
| Sane rubric                                       | CHECK `min ≤ max`, CHECK `weight ≥ 0`                                                                                                                                                  | –                                                                                                                           |
| Image rows describe what the API stores           | CHECK width and height in 1–1600 and `order >= 0` on `submission_images`                                                                                                               | The API re-encodes every image to at most 1600 px; a row that says otherwise is a bug                                       |
| Comments say something and moderation is recorded | CHECK on `comments.body` length (not blank, at most 2,000) and on `hidden_by_id` needing `hidden_at`                                                                                   | A comment cannot be blank or huge, whatever the caller                                                                      |
| A vote's rules make sense                         | CHECK `closes_at > opens_at` and 1–10 votes per voter on `voting_rounds`; a shared link only on an open-link vote; a ballot belongs to exactly one account or one personal link        | A bad window or a ballot nobody (or two voters) owns cannot exist, whatever the caller                                      |
| Answers stay within their event                   | Trigger on `answers` checks the question and the submission share an event; CHECKs on prompt and answer length                                                                         | An answer can never attach a team's text to another event's question, whatever the caller                                   |
| History is never silently lost                    | `audit_log` FKs are `ON DELETE RESTRICT`                                                                                                                                               | A cascade would UPDATE audit rows, which the trigger forbids; users and events with history are never hard-deleted          |

## Duplicates (the Dry Harbour case)

The fixtures contain one duplicate: "Dry Harbour", team `tm_07`, submitted as `prj_07` (04:29) and `prj_41` (17:57, 3 minutes before close). The team decided: **flag, keep the latest, let the organiser confirm** ([ADR](docs/decisions/20260926-1315-a-duplicate-hold.md)).

On import:

1. Both rows are created and **both stay visible** in the gallery (the checker must still find fixture titles, and nothing is decided silently).
2. The earlier copy gets `duplicate_hold = true`, which takes it out of the one-live-per-team index while the decision is pending.
3. A `duplicate_flags` row (SAME_TEAM, PENDING, kept = `prj_41`) is created and audited.

The organiser decides on `/organizer/events/:event/entries` (`POST /api/duplicates/:id/confirm | dismiss | reopen`), which shows beforehand exactly whose reviews move and whose are set aside ([ADR](docs/decisions/20260928-0812-a-duplicate-decisions-and-disqualification.md)):

- **Confirm** sets `prj_07.superseded_by_id = prj_41` and clears the hold. Reviews by judges who reviewed only `prj_07` (jdg_01, jdg_12) move across: their assignment now points at `prj_41` and the review records `original_submission_id`. Reviews by judges who reviewed both (jdg_19, 21, 26) stay on `prj_07` as `superseded`. Result: `prj_41` has 6 counted reviews, no judge counts twice, and jdg_01's only score survives.
- **Dismiss** (different projects) is refused for one team's two entries: a team has one live entry.
- **Reopen** reverses either decision from those two markers, row for row (tested against a snapshot of every assignment and review).
- Confirming is refused when an entry already took part in another confirmed decision, so every decision can be undone on its own.

## Eligibility

`submissions.eligibility` (ELIGIBLE / DISQUALIFIED) and `disqualify_reason` are set by the event's organisers (`POST /api/submissions/:ref/disqualify` with a reason, `.../reinstate`). A disqualified entry keeps its data and reviews but leaves the gallery, assignment, the judge console, progress and rankings, which all read one definition of "in judging" (`modules/judging/in-judging.ts`: submitted, eligible, not held, not replaced). Its team sees the reason on its submission page.

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

## Import (way in)

`cli import <file.json>` loads **any** file in the fixtures.json shape into a running portal, through the same importer and the same validation as the seed, without demo data:

```sh
docker compose cp event.json api:/tmp/event.json
docker compose exec api node dist/cli/cli.js import /tmp/event.json
```

- The whole file is validated first (every reference, every date, every score is an integer) and every problem is listed; nothing is written if any is found.
- It is idempotent like the seed: rows are matched by their file ids, so importing the same file twice changes nothing. A different event id creates a separate event; its slug gets `-2`, `-3`… if the name's slug is taken.
- People are matched by email. Accounts it creates have **no password**; the portal sends no email, so an operator issues one with `cli reset-password <email>` (printed once, audited).
- An Evenhand export's optional `evenhand` block is applied to the rows the import creates: the slug, opening and judging dates, prizes, rubric labels, weights and ranges, custom questions, and project taglines, descriptions, links, tags and answers. Like prizes, questions are created only together with a new event, so a repeated import never brings back a question an organiser has removed. Other files simply do not have it.

## Export (ways out)

| Export                                                                                 | Route                                                                                      | Status |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| Every review, one row per review, one column per criterion                             | `GET /api/events/:event/export/scores.csv` (organisers)                                    | ✅     |
| The event's audit trail with a readable summary per entry                              | `GET /api/events/:event/export/audit.csv` (organisers)                                     | ✅     |
| Teams and members, submissions (+ one column per question), assignments (one CSV each) | `GET /api/events/:event/export/{teams,submissions,assignments}.csv` (organisers)           | ✅     |
| Results: the published ranking (else the newest run), with reasons                     | `GET /api/events/:event/export/results.csv` (organisers)                                   | ✅     |
| Whole event in the fixtures.json shape (round trip)                                    | `GET /api/events/:event/export.json` (organisers), `cli export-event <event> [--out file]` | ✅     |

**The event export** is the organisers' fixtures.json shape, so any DOGFOOD portal can read it, plus an `evenhand` block with what that shape cannot hold (see Import above). Ids are the fixture ids where a row has them, else ours. Only **submitted** projects and **final** reviews are exported: drafts stay private and unfinished reviews are not scores. The shape requires a track on every project, so a project without one is exported in a placeholder track `evenhand-no-track` ("No track"). Every list is sorted by id (projects by their original order), so export → import into a fresh portal → export gives a byte-identical file; `tests/api/transfer.e2e-spec.ts` checks exactly that, and that exporting `evt_01` reproduces the published fixtures.json record for record.

Images are not part of any export: the fixtures.json shape has no field for them, and they live in the `uploads` volume, which is backed up next to the database (README, "Backup and restore").

CSV rules: UTF-8 without a BOM, a multi-column header, RFC 4180 quoting, `\n` line endings, stable row order (judge, then project in fixture order). Text that a spreadsheet would run as a formula (starting with `=`, `+`, `-`, `@`, tab or carriage return) gets a leading `'`; numbers are left alone. Fixture ids are used when present, so a CSV can be joined back to `fixtures.json`.
