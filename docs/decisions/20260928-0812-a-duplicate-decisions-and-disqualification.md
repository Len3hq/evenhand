# Duplicate decisions and disqualification

- Status: accepted
- Date: 2026-09-28 · Owner: A (merge flow planned for B, built by the team's A under the whole-app plan)

## Context

The fixtures plant one duplicate: "Dry Harbour", team `tm_07`, as `prj_07` and `prj_41`. Import flagged it and held the older copy (ADR 20260926-1315), but an organiser could not act on the flag, so the held copy's 5 reviews sat unused. Eligibility (BUILD-PLAN decision 18) existed in the schema with no way to set it. Three judges reviewed both copies; jdg_01's only score in the whole file is on `prj_07`.

## Decision

- **Confirm** keeps the newer entry (BUILD-PLAN decisions 5–7, §8): the older one gets `superseded_by_id`. Reviews by judges who reviewed only the older copy move across (the assignment points at the kept entry; the review records `original_submission_id`). Reviews by judges who reviewed both are marked `superseded` and do not count. On the fixtures `prj_41` ends with 6 counted reviews.
- **Dismiss** is for flags between different teams (same repo or title). For one team's two entries it is refused (409 `duplicate_same_team`): a team has one live entry.
- **Reopen** undoes either decision exactly, driven by the two markers above; a test compares every assignment and review with a snapshot taken before the decision.
- **No chains.** Confirming is refused (409 `duplicate_chain`) when either entry already took part in another confirmed decision, so each decision can be undone on its own. Both entries are locked (`SELECT … FOR UPDATE`) before the check, so two organisers deciding two flags that share an entry cannot race past it; the flag itself moves out of PENDING with a conditional update, so it cannot be decided twice.
- **Disqualify** needs a reason (3–500 characters), which the team sees and the audit trail records; **reinstate** reverses it. Only submitted entries; no deadline, since breaches are often found after judging.
- **One definition of "in judging"** (`modules/judging/in-judging.ts`: submitted, eligible, not held, not replaced), now used by assignment, the judge console, progress and rankings instead of three copies. A withdrawn project leaves each judge's queue; reading its review still works, writing is refused with 409 `not_in_judging`.
- **Rankings** need no special case: a decision changes the reviews a run reads, so the inputs hash moves and the latest run is out of date until it is run again. Published results stay as published until a new run is published.
- The organiser page `/organizer/events/:event/entries` shows, before confirming, whose reviews will move and whose will be set aside, by judge name.

## Consequences (including what we gave up)

- The kept entry is always the newer one. An organiser who wants the older copy judged would disqualify the newer one after confirming; a "keep the older" choice was left out as rare.
- Assignments on the older copy that have no review yet are not moved (there is nothing to record their origin by); they simply leave the queue with the copy.
- Duplicates are detected on import only. Inside the portal, one live entry per team is enforced by the database, so a team cannot create a second one; a cross-team copy entered by hand is not detected.
