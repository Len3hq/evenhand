# Judging

How Evenhand assigns judges, scores projects, corrects for harsh and generous judges, and keeps judges out of each other's work. Sections marked ⏳ describe the agreed design (BUILD-PLAN §7–§10) that is being built; each will be updated with the implemented details and fixture results.

## 1. Role isolation (implemented)

| Actor                     | Own scores | Peer scores | Other event | Scores CSV | Audit log |
| ------------------------- | ---------- | ----------- | ----------- | ---------- | --------- |
| Visitor                   | 401        | 401         | 401         | 401        | 401       |
| Participant               | 403        | 403         | 403         | 403        | 403       |
| Judge                     | ✅         | **403**     | 403         | 403        | 403       |
| Organiser (of that event) | –          | ✅          | 403         | ✅         | ✅        |
| Admin                     | ✅         | ✅          | ✅          | ✅         | ✅        |

Enforced in API services, deny first: a judge asking for another judge's scores is refused **before** the database is asked whether that judge exists, so a real and a made-up judge get identical answers. The whole matrix is an e2e test ([`tests/api/isolation.e2e-spec.ts`](tests/api/isolation.e2e-spec.ts)) run on every change, alongside the organisers' `run.py`.

Track isolation (a judge sees only projects in their `judge_tracks`) is modelled in the schema and arrives with the judge queue ⏳.

## 2. Weighted rubric (implemented)

Each review holds raw values per criterion. Its weighted score, on the criterion scale:

```
s = Σ_c w_c · x_c  /  Σ_c w_c
```

- Weights are relative (normalised by their sum). The fixtures carry no weights, so the default is **equal** for functionality, innovation and quality.
- Organisers set criteria, weights and whole-number ranges on the event's settings page (`PUT /api/events/:event/criteria`). The rubric is public (`GET`), and each project page shows what it is judged on and each criterion's share.
- Once any review is final, labels and weights can still change, but adding or removing criteria and changing a scored range are refused, because finished reviews would no longer fit ([ADR](docs/decisions/20260927-1929-b-rubric-editing-rules.md)).
- Raw values are stored and the weighted score is computed when read, so re-weighting applies to past reviews too, and the change is audited.
- A missing or out-of-range value is an **error, not a zero** (`RubricError`): silently scoring it as 0 would move a rank. The database also rejects out-of-range values.
- Code: [`src/judging-engine/src/weighted.ts`](src/judging-engine/src/weighted.ts), with tests.

## 3. Judges and assignment

**Invitation (implemented).** Organisers create judge invite links from the event's settings page, choosing the tracks the judge covers; a link admits one person by default, or up to 50 for a panel. Accepting makes the person a judge of the event for those tracks. Nobody on a team in the event or organising it can accept. Organisers see each judge's tracks and progress, can change the tracks, and can remove a judge only before they have reviewed anything: a judge with reviews stays on the record.

**Assignment (implemented).** A pure, seeded function in the judging engine ([`assign.ts`](src/judging-engine/src/assign.ts)), run from the event's settings page (`POST /api/events/:event/assignments/run`):

1. The pool is submitted, eligible projects that are not a held or replaced duplicate copy.
2. A judge may review a project if they cover its track (a trackless project can go to anyone), have no conflict of interest with its team (declared conflicts plus the judge's own team, always), and are not already assigned to it.
3. Repeatedly, the project with the fewest reviews goes to the least-loaded judge who may review it, until every project reaches the target (3 by default) or runs out of eligible judges. Ties, and each judge's queue order, come from a seeded generator; the seed is returned and audited, so a run can be reproduced.
4. A run only tops up: existing assignments are never moved, so it can be run again after late submissions or new judges.
5. It reports projects that cannot reach the target (with how many judges could review them) and the number of connected judge–project groups, because judges in separate groups cannot be compared when normalising.

On the fixtures: 8 new assignments bring the eight projects that only two judges finished up to 3. All 40 judged projects then have 3–5 reviews (34 × 3, 3 × 4, 3 × 5) and every judge is in one connected group. Unit tests cover coverage, tracks, conflicts, even load, reproducibility and the fixture top-up ([ADR](docs/decisions/20260927-2057-b-assignment.md)).

## 4. Normalization ⏳ (B)

A **joint additive model**, fitted by ridge-penalised least squares (decision 10):

```
s_pj = μ + q_p + b_j + ε        minimise  Σ (s_pj − μ − q_p − b_j)² + λ_b Σ b_j² + λ_q Σ q_p²
```

- **Why not per-judge z-scores:** they assume every judge saw projects of average quality, but every fixture review is track-matched, so a judge's mean mixes their generosity with their track's strength. And z-scores divide by the judge's standard deviation, which is **0 for jdg_07** (4/4/4 on everything).
- **The judge who marks everything the same (jdg_07):** the model absorbs their offset in `b̂`; their reviews add no discrimination and cause no distortion; there is no division by σ. They get a neutral "low score variance" flag.
- λ is chosen by leave-one-review-out prediction error (closed form, via the hat matrix). Uncertainty is shown as a posterior SD and as tie groups (not chained).
- Proof: a synthetic recovery test (Spearman ρ > 0.9, beating raw means and z-scores), and the fixture tables (raw vs normalized, rank movement, judge biases, spread before/after) generated by `cli proof`.

## 5. Duplicates

See [DATA-MODEL.md → Duplicates](DATA-MODEL.md#duplicates-the-dry-harbour-case). Detection is implemented and runs on import; the confirm/merge flow is ⏳ (B).

## Threat model

What we stop, what we reduce, and what we do not stop. Updated as features land.

| Threat                                                                             | Status                                   | Defence                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A judge reads another judge's scores                                               | **Stopped**                              | Deny-first 403 in the service; e2e matrix; `run.py` check 5                                                                                                                                                                                                                                                                                                                    |
| A participant or visitor reads scores                                              | **Stopped**                              | `@RequireRole` + service checks; 401 for visitors                                                                                                                                                                                                                                                                                                                              |
| An organiser of another event reads this event's scores                            | **Stopped**                              | Per-event roles; tested                                                                                                                                                                                                                                                                                                                                                        |
| Late or out-of-window submissions (clock skew, API bypass)                         | **Stopped** on every write               | Server clock (UTC), `opens_at <= now < close`, checked before validation; both boundary instants tested. Applies to creating, editing and submitting a project, and to team creation, invites and joining ([ADR](docs/decisions/20260927-1441-a-drafts-edit-until-deadline.md))                                                                                                |
| Cross-site request forgery with a judge's cookie                                   | **Stopped**                              | Cookie-authenticated writes need an allowed `Origin`; cookie is httpOnly + SameSite=Lax; tested                                                                                                                                                                                                                                                                                |
| Password guessing                                                                  | **Reduced**                              | argon2id; 10 login attempts per minute per IP (429); same answer and timing for unknown emails                                                                                                                                                                                                                                                                                 |
| Editing history after the fact                                                     | **Reduced**                              | Append-only `audit_log` enforced by database triggers; audit rows written in the same transaction as the change. A database superuser can still disable triggers. Hash-chaining is a stretch goal. Organisers read the trail as sentences (`GET /api/events/:event/audit`, CSV export); IP addresses are shown to admins only                                                  |
| Duplicate or resubmitted entries                                                   | **Reduced**                              | One live submission per team (database index); duplicate flags on import                                                                                                                                                                                                                                                                                                       |
| Leaked demo tokens                                                                 | **Accepted in demo only**                | Tokens and the shared password are public by design so the checker works; refused when `DEMO_MODE=false`. A real deployment has no default admin: the first one is created from the server shell (`cli create-admin`) with a random password shown once                                                                                                                        |
| Rotating `X-Forwarded-For` to dodge per-IP rate limits                             | **Not stopped** behind the bundled proxy | Next.js keeps a client-supplied header. Put a reverse proxy in front that overwrites it for public deployments                                                                                                                                                                                                                                                                 |
| A judge or organiser competing in their own event                                  | **Stopped** at every door                | Team creation and joining refuse the event's judges and organisers; judge invites refuse its team members and organisers; appointing an organiser refuses its team members and judges ([ADR](docs/decisions/20260927-2009-b-judge-invitation.md)). Someone made a judge _after_ joining a team is impossible by these rules; assignment (⏳) will also skip a judge's own team |
| Probing which teams or drafts exist                                                | **Stopped**                              | Teams and draft submissions are visible to their members, the event's organisers and admins; anyone else gets the same 403 for a real and a made-up id. Only submitted, eligible entries are public                                                                                                                                                                            |
| A leaked or forwarded invite link (team or judge)                                  | **Reduced**                              | 256-bit token stored only as SHA-256 and never written to the audit log; team links 7 days and 4 uses, judge links 1 use by default (up to 50 for a panel), 1–30 days; the last place is claimed atomically and the database refuses more uses than allowed; joining a team stops at the deadline, becoming a judge when judging closes                                        |
| Spreadsheet formula injection through exports (a project titled `=HYPERLINK(...)`) | **Stopped**                              | Every CSV export prefixes text starting with `=`, `+`, `-`, `@`, tab or carriage return with `'`; numbers are untouched. Unit- and e2e-tested                                                                                                                                                                                                                                  |
| Judge collusion / bloc scoring                                                     | **Not stopped**                          | Planned: randomised assignment and conflict-of-interest blocks reduce opportunity. Detection is noise at 1–11 reviews per judge                                                                                                                                                                                                                                                |
| Sybil votes, ballot stuffing                                                       | **Not applicable**                       | Community voting (T3) is not built                                                                                                                                                                                                                                                                                                                                             |
| Gallery scraping                                                                   | **Accepted**                             | The gallery is public by design; default rate limit applies                                                                                                                                                                                                                                                                                                                    |
