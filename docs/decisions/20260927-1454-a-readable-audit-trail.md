# A readable audit trail

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

The spec scores "an audit trail an organizer can actually read" under Judging Integrity. The `audit_log` table was already append-only (database triggers) and written in the same transaction as each change, but a row is `action = event.updated, target_id = 01a0…, before = {…}` — correct, not readable.

## Decision

- **Sentences are made by the API, not the UI.** Every entry returned by `GET /api/events/:event/audit` carries a `summary` such as `Demo Organizer changed the event: submissionsClose: 2031-06-01 18:00 UTC → 2031-06-08 18:00 UTC`. One pure function (`modules/audit/summarise.ts`, unit-tested) owns the wording, so the page, the CSV and any API client say the same thing.
- **Targets are named.** Each entry is labelled with the current name of its target (event, track, prize, team, submission title, user email), resolved with one query per target type. A deleted row is named from the snapshot the entry kept of it.
- **Filters** an organiser actually uses: an action or a group of actions (`submission.`), a person (email or id), one row. Newest first, paged.
- **Scope and privacy.** An event's trail is for its organisers and admins. Entries outside any event (logins, failed logins, new accounts, admin grants) are a separate admin-only view, and only that view shows IP addresses. Tokens and password hashes are never written to the log in the first place.
- **CSV export** of the whole trail, oldest first, with the same summaries. All CSV exports now neutralise spreadsheet formulas in text cells (OWASP "CSV injection"), since participants control project titles and team names.

## Consequences (including what we gave up)

- Adding an audit action means adding a sentence to `summarise.ts`; an unknown action still shows as `Name: action.name`, never an error.
- Target names are today's names: a renamed track shows its new name on old entries. The old name is in the entry's `before`.
- The trail is tamper-resistant, not tamper-proof: a database superuser can disable the triggers. Hash-chaining the log is a stretch goal.
