# The audit log is hash-chained by the database

- Status: accepted
- Date: 2026-09-28 · Owner: A

## Context

The audit log was already append-only: triggers refuse `UPDATE`, `DELETE` and `TRUNCATE`. But anyone with database superuser access can disable those triggers, change history and switch them back on, and nothing would show it. Judging Integrity asks for an audit trail an organiser can trust, and BUILD-PLAN listed a hash chain as stretch goal #1.

## Decision

- Every `audit_log` row gets `prev_hash` and `hash`. A `BEFORE INSERT` trigger (`audit_log_chain`) sets them: `prev_hash` is the chain's head, and `hash` is SHA-256 of the row's canonical JSON (every column but `hash`, via `jsonb_build_object`; UTC timestamps with milliseconds), `prev_hash` included.
- The head lives in a one-row table, `audit_chain_head`, locked `FOR UPDATE` by the trigger. Finding it costs nothing however long the log grows, and concurrent writers take their turn, so the chain never forks. `prev_hash` and `hash` are both unique, so a fork is impossible anyway.
- The database computes the hash, not the application. No code path can skip it, and the verifier uses the same SQL function (`audit_log_hash`), so both always agree on the canonical form.
- Existing rows were backfilled in `id` order by the migration.
- `GET /api/audit/verify` (organisers and admins; only admins get the affected ids), the tamper check on both audit pages, and `cli verify-audit` (exit 1 if broken) check three things: every hash matches its row, every link points to an existing row, and the walk from the first entry reaches every row and ends at the recorded head.

## Consequences

- Editing an entry, deleting one, or removing the newest ones directly in the database is detected (all three tested, plus 25 simultaneous writes forming one chain).
- **Not stopped:** someone with full database access can recompute the chain from their edit onwards, and update the head too. Keeping a copy of the head hash outside the database (it is shown on the audit pages; backups keep it) is what catches that. Publishing the head with the results would anchor it publicly; that is not built.
- Audit inserts are serialised by one row lock. That is fine for a hackathon's write rate, and it is the price of a linear chain.
- Prisma knows `audit_chain_head` (a model the application only reads), so `migrate dev` never tries to drop it.
