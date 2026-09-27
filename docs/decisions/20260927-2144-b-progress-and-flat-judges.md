# The progress dashboard, and what counts as a "flat" judge

- Status: accepted
- Date: 2026-09-27 · Owner: B (built by the team's A under the whole-app plan)

## Context

T2 asks for "a live organizer progress dashboard". The fixtures also plant "a judge who gave every project the same score" (jdg_07: 4/4/4 on all three projects), which an organiser should notice before results are computed.

## Decision

- `GET /events/:event/progress` (organisers and admins): per judge (assigned, submitted, drafts, not started, last activity, tracks), per project (submitted and draft reviews against assigned) and totals. Only projects in judging count, so the held copy of the Dry Harbour duplicate does not.
- The page polls it every 10 seconds while the tab is visible, starting from server-rendered data. Polling, not a socket: one API, no extra server, fine at hackathon scale.
- A judge is **flat** when they gave **exactly the same marks, criterion by criterion**, across at least 3 final reviews. We first flagged identical _weighted scores_ and the fixtures showed why that is wrong: jdg_19 gives 3/5/3, 3/4/4 and 5/4/2, which all average 3.67 by chance. That judge told the projects apart; jdg_07 did not. Two reviews are too few to call either way.
- Stage exports beside `scores.csv` and `audit.csv`: `teams.csv`, `submissions.csv`, `assignments.csv`, with fixture ids where rows have them and spreadsheet formulas neutralised.

## Consequences (including what we gave up)

- The flag is a prompt for the organiser, not a penalty; what normalisation does with such a judge is decided in JUDGING.md §4.
- Up to 10 seconds of lag; a judge's autosaved draft appears on the next refresh.
