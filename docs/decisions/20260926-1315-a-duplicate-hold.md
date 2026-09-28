# Imported duplicates and the one-live-submission rule

- Status: accepted
- Date: 2026-09-26 · Owner: A (merge flow: B)

## Context

BUILD-PLAN decision 4 (one live submission per team, a partial unique index) conflicts with decision 5 (both copies of an imported duplicate stay visible until the organiser confirms): the fixture's Dry Harbour pair (`prj_07`, `prj_41`, team `tm_07`) would violate the index on import.

## Decision

Add `submissions.duplicate_hold`. The index is `(event_id, team_id) WHERE superseded_by_id IS NULL AND NOT duplicate_hold`. On import, the earlier copy of a same-team pair is put on hold and a PENDING `duplicate_flags` row is created. Confirming sets `superseded_by_id`; the rule "keep the latest" is the user's decision.

## Consequences

For same-team duplicates "dismiss" is not a valid outcome (both cannot stay live); the organiser confirms, or disqualifies one. Tested in `constraints.e2e-spec.ts`.

Update 2026-09-28: the confirm, dismiss and reopen flow is built ([ADR](20260928-0812-a-duplicate-decisions-and-disqualification.md)).
