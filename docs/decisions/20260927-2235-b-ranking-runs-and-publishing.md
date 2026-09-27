# Ranking runs, receipts and publishing

- Status: accepted
- Date: 2026-09-27 · Owner: B (built by the team's A under the whole-app plan)

## Context

The spec's lifecycle ends with "publish", and Judging Integrity asks for results an organiser can defend. The normalisation model exists in the engine; the portal needs to run it, show its working, and make one run public without anything changing underneath it.

## Decision

- **A run** (`POST /events/:event/rankings`, organisers) uses every final, non-superseded review of the projects in judging, weighted by the current rubric, and the engine's model with λ chosen by leave-one-out. It stores each project's raw mean, normalized score, posterior SD, rank, tie group, review count and a one-line reason ("+0.12: its judges were on average 0.12 less generous than the rest; pulled towards the mean (2 reviews)").
- **Evidence rules.** A project with fewer than 2 final reviews is listed, never ranked (decision 54). Rank order ties break on raw mean, review count, then earliest submission (decision 11). Tie groups use the no-chaining rule.
- **Receipts.** Each run stores SHA-256 hashes of its canonical inputs (criteria and every final review) and of its result, so the same data always yields the same hashes and anyone with the exports can check a published result.
- **Publishing** freezes a run as the event's results and sets `results_published_at`. It is refused (409 `ranking_stale`) when the inputs hash no longer matches the data, e.g. a new review or a re-weighted rubric: the organiser runs again first. Runs are kept; the newest published one is public.
- **Public results** (`GET /events/:event/results`, `/events/:event/results`) answer 404 until published, for everyone including organisers: results are hidden until the organisers decide.
- The results page states the signal level (leave-one-out gain over the overall mean) and asks readers to read tie groups, not single ranks, when it is low. On the fixtures that is 0.9% and 2 tie groups, identical to docs/proof/normalization.md (a test checks the portal's fixture ranking against the proof's).

## Consequences (including what we gave up)

- Publishing is not "final forever": a later run can be published and replaces the public results; both publications are in the audit trail.
- Hashes prove consistency, not identity: they are not signatures. Signed, publicly verifiable records are T4 and not built.
