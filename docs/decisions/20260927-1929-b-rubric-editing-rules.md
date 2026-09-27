# Editing the rubric: what can change once judging starts

- Status: accepted
- Date: 2026-09-27 · Owner: B (built by the team's A under the whole-app plan)

## Context

T2 asks for "a weighted scoring rubric the organizer can configure". Scores are stored raw, per criterion, and the weighted score is computed when read, so a rubric edit can silently change every result. Some edits are legitimate after judging starts (an organiser decides innovation should count double); others would corrupt what judges already did.

## Decision

- `GET /events/:event/criteria` is **public**, with each criterion's share of the score, and project pages show it ("Judged on"). Teams should know how they are judged; the spec's premise is that the market leader cannot even weight criteria.
- `PUT /events/:event/criteria` replaces the whole rubric in one validated, audited step (organisers and admins): 1–10 criteria, unique keys (derived from labels when omitted), weights ≥ 0 with a positive sum, whole-number ranges with min < max.
- Once **any review is final** the rubric is `locked` for structure:
  - **allowed:** new labels and weights. Past reviews are re-weighted when read; the audit trail records the change ("changed the rubric: "Functionality" weight 1 → 2").
  - **refused (409 `rubric_locked`):** removing a criterion, changing a scored criterion's range, adding a criterion. Each would leave finished reviews with a missing or out-of-range value, which the engine treats as an error, not a zero.
- The rules are one pure function (`rubric-rules.ts`) with unit tests; the database's range and weight constraints stay as the last line.

## Consequences (including what we gave up)

- An organiser who forgot a criterion must decide before the first review is final, or run without it.
- Re-weighting after results are seen is possible and visible, not prevented: the audit trail and the published method (JUDGING.md) are the check on it.
