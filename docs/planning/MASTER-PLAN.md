# DOGFOOD 2026 — Master Plan (merged from 4 drafts)

> Source drafts: **A** = "Agent Execution Plan", **B** = "Winning Build Plan (DeepSeek)", **C** = "DOGFOOD-PLAN / Tally", **D** = "VERDICT".
> This file consolidates them. Where they conflict, the decision and the reason are stated. Treat this as the source of truth for the coding agent.

---

## 0. TL;DR

- **Build:** a self-hostable hackathon submission + judging portal (same product as every other team).
- **Win by:** passing T1 + T2 on the organizers' acceptance checker cleanly, then being the team with the **most defensible judging**: normalization that survives the fixtures' traps, a readable tamper-evident audit trail, and a results page that explains *why* each project ranks where it does.
- **Pitch:** *"Judging you can check."* Bias-corrected scores, explained rankings, and an audit log you can verify.
- **Bonuses to chase:** Normalization Proof (+5), Threat Model (+3). Also API First (+3) if it stays cheap. **Skip Pairwise (+5)** unless everything else is finished.
- **Golden rule (all 4 drafts agree):** a clean T2 beats a broken T4. Never let the checker regress.

---

## 1. Where the four drafts agree (the non-negotiables)

Every draft says these things, so they are settled:

| Consensus point | A | B | C | D |
|---|:-:|:-:|:-:|:-:|
| `docker compose up` alone → seeded, working portal, network **off** | ✓ | ✓ | ✓ | ✓ |
| No cloud / hosted DB / auth-as-a-service / external APIs | ✓ | ✓ | ✓ | ✓ |
| Migrations + seed run automatically on boot, DB readiness handled | ✓ | ✓ | ✓ | ✓ |
| Role checks enforced **in the backend** (curl test, not UI hiding) | ✓ | ✓ | ✓ | ✓ |
| Judge can't read another judge's scores → 403 | ✓ | ✓ | ✓ | ✓ |
| Weighted, organizer-configurable rubric | ✓ | ✓ | ✓ | ✓ |
| Cross-judge normalization, documented with formulas | ✓ | ✓ | ✓ | ✓ |
| CSV export for organizer | ✓ | ✓ | ✓ | ✓ |
| Audit trail of scoring actions | – | ✓ | ✓ | ✓ |
| Normalization Proof is the #1 bonus | ✓ | ✓ | ✓ | ✓ |
| T3/T4 only after T1/T2 are verified | ✓ | ✓ | ✓ | ✓ |
| Honest tier claims; docs are part of the score | – | ✓ | ✓ | ✓ |

**Implication:** everyone else read the same brief. Meeting these is table stakes, not a differentiator. We win on *how well* we do T2 + integrity + docs.

---

## 2. Where they conflict, and what we do

| Topic | Drafts say | **Decision** | Why |
|---|---|---|---|
| **Coding before kickoff** | B: "prepare scaffolding, Docker, schema". C: "no code/commits before Fri 18:00 UTC, commits before then disqualify" | **No project code or commits before kickoff.** Only plans, notes, and sketches outside the repo. | Disqualification risk isn't worth a 2-hour head start. Confirm the exact rule in `spec.md` when it lands on Sep 24. |
| **Seed data** | A: 1 admin, 5 judges, 20 participants, 10 projects (hand-made). D: synthetic 40 projects / 12 judges. C: load organizers' `fixtures.json` | **Load the organizers' `fixtures.json`** (≈40 projects, 30 judges, 8 tracks) + a few synthetic demo accounts. | The checker looks for fixture project titles in the gallery. Made-up seed data fails check #2. |
| **Roles** | A: Admin/Judge/Participant. Others: visitor/participant/judge/organizer/admin | **5 roles:** visitor, participant, judge, organizer, admin. Roles are scoped **per event**; admin is global. | The checker authenticates as `organizer`, not admin. |
| **Stack** | A: Express or FastAPI + MySQL/Postgres. B: Next.js-only + Prisma. C/D: NestJS + Next.js + Postgres + Prisma | **NestJS (API) + Next.js (UI) + PostgreSQL 16 + Prisma**, one public port through a Next rewrite. | 2 of 4 converge on it, and C spec'd it in detail. Nest guards/decorators give clean RBAC layering. *Fallback:* if the team is 1–2 people, collapse to a single Next.js app (B). Decide at kickoff and don't switch after. |
| **Normalization method** | A/B/D: per-judge z-score. C: additive judge-bias model (ridge ALS), because z-scores break | **Implement both as pure functions. z-score is the baseline; the bias model is the headline method. Show both in the proof.** See §5. | The fixtures deliberately include a judge who gives every project the same score (σ = 0 → z undefined) and uneven review batches. Plain z-score is what every team will ship, and it is fragile on exactly these traps. Handling them visibly *is* the Normalization Proof. |
| **Rescaling** | B: `50 + 15z`, clamp 0–100. Others: unspecified | Use B's display scale for the z-score view. Report the bias model on the original rubric scale (`μ + q_p`). | Readable numbers, and no fake precision. |
| **Signature differentiator** | C: hash-chain + Merkle + Schnorr + `tally verify` CLI. D: pairwise + bootstrap stability + explainability. | **Tiered:** (1) hash-chained audit log + explainable results page (cheap, high value), (2) bootstrap rank-stability, (3) Merkle root + signed judge records + verify CLI. Pairwise last. | See §6 for costs. The cheap items serve the 25% Judging Integrity criterion directly. Pairwise needs a whole second judging UI, and the fixtures contain **no pairwise data** to demo on. |
| **Threat model file name** | A: `THREAT_MODEL.md`. B: `SECURITY.md`. C: inside `JUDGING.md` | **`THREAT_MODEL.md`**, linked from README and JUDGING.md. **Rename it to whatever `spec.md` names.** | Match the spec exactly so the bonus gets counted. |
| **Prize facts** | A: "₹10,000 Best Judging Engine". B: "$2,500 pool, $800 1st + adoption" | **Treat A's prize numbers as unverified.** B and C agree on dates and the adoption angle. | Confirm on dogfoodhack.com. It doesn't change the plan. |
| **Rate limiting / vote anti-abuse** | A: Phase 3 task. D/B: T3 | Add `@nestjs/throttler` on login and score-write endpoints **during T2** (≈15 min). The full voting anti-abuse suite is T3 only. | Cheap, and it strengthens the integrity story and the threat model without starting T3. |
| **Score edits** | D: keep history (3 → 4 must remain visible). C: audit entries | Scores can be edited until judging closes. Each edit writes an audit entry with `old → new`. Past values are never silently overwritten. | Everyone wants auditability; this is the cheapest correct form of it. |

---

## 3. The acceptance checker is the contract

(From C. **Re-verify against the real `run.py` at kickoff.** Read its source before writing features.)

| # | Tier | Request | Must return |
|---|---|---|---|
| 1 | T1 | `GET {gallery}` without auth | exactly **200**. A redirect to login fails. |
| 2 | T1 | `GET {gallery}` | body contains a title from the **first 3 fixture projects** (page 1) |
| 3 | T1 | `POST {submit}` as participant, `{"title":"dogfood-late-submission-probe","summary":"probe"}` | any **4xx** (3xx fails) |
| 4 | T2 | `GET {judge_scores}` as judge_a | **200** |
| 5 | T2 | `GET {peer_scores}` (judge_a's scores) as judge_b | **401/403** |
| 6 | T2 | `GET {judge_scores}` as participant | **401/403** |
| 7 | T2 | `GET {csv_export}` as organizer | **200**, first line contains a comma |

Design rules that follow from the checker:
- Gallery `GET /api/projects` is `@Public()`, sorted in fixture order, page size ≥ 50.
- The deadline check runs **before** DTO validation → `403 {"code":"SUBMISSION_DEADLINE_PASSED"}`. One `assertSubmissionsOpen(event, serverNow)` is used by every project/team write.
- The API never redirects. Unauthenticated → 401, wrong role or not owner → 403.
- Deterministic demo session tokens are created only when `DEMO_SEED=true`, printed on boot, and documented as demo-only in README and the threat model.
- `judge_a` = the fixture judge with the most scores. `participant` = a team member who is **not** also a judge.
- `peer_scores` resolves `:judgeId` by internal id **or** fixture externalId.

```toml
# .dogfood.toml (draft)
[portal]
base_url = "http://localhost:8080"
[tiers]
claimed = ["T1", "T2"]   # set honestly at the end, from acceptance-report.txt
pitch = "Judging you can check: bias-corrected scores, explained rankings, a tamper-evident audit log."
[auth]
organizer   = "Cookie: session=demo_organizer"
judge_a     = "Cookie: session=demo_judge_a"
judge_b     = "Cookie: session=demo_judge_b"
participant = "Cookie: session=demo_participant"
[routes]
gallery      = "/api/projects"
submit       = "/api/projects"
judge_scores = "/api/judge/scores"
peer_scores  = "/api/judges/<JUDGE_A_EXTERNAL_ID>/scores"
csv_export   = "/api/export/scores.csv"
```

---

## 4. Fixture traps (other teams will trip on these)

C's fixture notes list deliberate edge cases. Each one is a chance to look better than the field:

| Trap | What a naive build does | What we do |
|---|---|---|
| Judge who gives every project the same score | z-score divides by σ = 0 → NaN or crash | Detect `var < ε, n ≥ 3`. Keep their leniency information, down-weight them for ranking, flag them on the dashboard, and log the decision in the audit trail. |
| Unfinished review batches (uneven or missing reviews) | Ranks a 1-review project the same as a 3-review one | Show `n_reviews` and a standard error. Projects with fewer than 2 reviews get a "low confidence" badge. |
| Duplicate submission | Silently drops it or double-counts it | Keep the earliest, mark the other `duplicateOf`, exclude it from ranking, and show it to the organizer and in the audit log. |
| **Judge who is also a team member** (the sample fixture has `ada@example.org` as both judge `jdg_01` and a member of `tm_01`, and scoring `prj_01` from `tm_01`) | Nobody notices | Conflict-of-interest check: block it in new assignments; for imported scores, **flag without deleting** and let the organizer decide to exclude. Show this in the demo. |
| Past `submissions_close` | "Fixes" the date so submissions work | Never override it. The late probe must get a 4xx. For the demo, create a *second* event with an open window. |

---

## 5. Judging engine (the part that wins or loses)

Put all of it in `packages/judging-engine` (or `api/src/judging/engine`) as **pure, deterministic, unit-tested functions**, never inside controllers (D, rule 4).

### 5.1 Weighted rubric
Criteria use min 1 and max 5. The organizer sets weights, which are normalized to sum to 1. Store the **raw per-criterion values** and compute `s = Σ w_c · x_c` at read time, so re-weighting applies retroactively and is audited.

### 5.2 Assignment
- Eligible judge = track matches **and** no conflict of interest.
- Greedy: take projects with the fewest eligible judges first, give each to the lowest-load eligible judges, break ties with a seeded RNG, and target k = 3 reviews per project.
- **Connectivity check** (C): the bias model can only compare judges within a connected judge–project component. Report the components and fix splits by swapping one assignment.
- Batches get numbers so they can be released in waves. Fixture scores import as completed assignments.

### 5.3 Normalization: two methods, one proof
1. **Baseline, per-judge z-score** (what the other drafts, and most teams, will ship):
   `z_jp = (s_jp − μ_j) / σ_j` → project = mean of its z values → display `clamp(50 + 15·z̄, 0, 100)`.
   Documented fallbacks: `σ_j = 0` → the judge contributes z = 0 and is flagged; `n_j < 3` → shrink toward 0.
2. **Headline, additive judge-bias model** (C): `s_jp = μ + q_p + b_j + ε`, fitted by ridge-regularized alternating least squares (λ_b ≈ 2, λ_q ≈ 0.5, stop when the max change is below 1e-6, at most 200 iterations, re-center mean(b) = 0). Normalized score = `μ + q_p`, with a standard error.
   **Why it's better, as the proof will state:** z-scores assume every judge saw a comparable random sample. Track-restricted, batched assignment breaks that assumption: a judge who drew only strong projects is wrongly marked "harsh". The additive model estimates judge bias *jointly* with project quality, so it doesn't make that mistake, and it has no division by σ.
3. **Synthetic test (Jest):** generate known `q` and `b`, add noise, and assert that the recovered ranking has Spearman > 0.9 against the truth **and beats both raw mean and z-score**. Keep that number; it is the headline of `JUDGING.md`.

### 5.4 Explainable results (D's signature moment, cheap once 5.3 exists)
Organizer results page and `GET /events/:id/results`:
- Raw rank vs z-score rank vs bias-model rank, with ▲/▼ movement.
- A "Why is this project #N?" drawer with the criterion breakdown, each judge's raw score next to that judge's estimated bias, `n_reviews`, SE, and flags (flat judge, conflict of interest, low confidence).
- Disagreement: the per-project score spread, described in neutral language ("high dispersion"), never "Judge X is wrong".
- A judge bias table sorted by `b_j` that uses neutral wording ("scores 0.6 above panel average").

### 5.5 Bootstrap rank stability (stretch; a pure function, about 1 hour)
Resample judges' reviews with a seeded RNG 1,000 times and report "% of resamples in which the project ranks top-3". Wording must be precise: *"under resampling"*, not "probability it's best".

---

## 6. Integrity layer: prioritized by value per hour

| Priority | Feature | Est. | Serves |
|---|---|---|---|
| **P1** | Hash-chained `AuditEntry` (sha256 over canonical JSON + prevHash), written in the same transaction as the change; a Postgres trigger blocks UPDATE/DELETE; readable timeline + "Verify chain" button | 3–4h | Integrity 25%, Threat Model, "I'd steal that" |
| **P1** | Backend isolation e2e test matrix (visitor/participant/judge own/peer/other-track/organizer/admin × each sensitive endpoint) | 2–3h | Tier correctness, Integrity |
| **P1** | Throttling on login and score writes; DB unique `(assignmentId)` on Score | 0.5h | Threat Model, anti-abuse |
| P2 | Explainable results + rank movement (§5.4) | 3h | Demo, Integrity |
| P2 | `@nestjs/swagger` OpenAPI at `/api/docs` | 1–2h | API First +3 |
| P3 | Bootstrap stability (§5.5) | 1h | Demo wow |
| P3 | Merkle root over scores at publish + `GET /proof/:scoreId` | 2–3h | Verifiability |
| P3 | Schnorr-signed judge records (`@noble/curves`) + `verify` CLI over exported `event.json` | 4–5h | T4 item, differentiator |
| P4 | T3 voting (quadratic, rate limits, hidden results) | 6h+ | Only if T2 is perfect by hour ~55 |
| P5 | Pairwise / Bradley-Terry mode | 6h+ | +5, but no fixture data to demo on |

**Cut line:** if any P1 is unfinished at Sun 16:00 UTC, skip P3 and below entirely.

---

## 7. Data model (C's schema, with D's additions)

```
User, Session(tokenHash), Membership(userId, eventId, role)   // per-event roles
Event(externalId, submissionsOpen/Close, judgingOpen/Close, resultsPublishedAt)
Track, Prize, JudgeTrack
Team(inviteCode), TeamMember
Project(externalId, status DRAFT|SUBMITTED, submittedAt, duplicateOfId?, coiFlag?)
CustomQuestion / CustomAnswer
Rubric, Criterion(key, label, weight, min, max)
Assignment(judgeUserId, projectId, batch, completedAt)          // unique(judge, project)
Score(assignmentId UNIQUE, values Json, comment, submittedAt)   // edits → audit old/new
AuditEntry(seq, eventId, actor, action, entityType, entityId, payload, prevHash, hash)  // append-only trigger
PublishedResult(method, params, merkleRoot, auditHeadHash, ranking, signature)          // P3
JudgeRecord(...)                                                                        // P3
```
Keep `externalId` everywhere so exports and checker URLs line up with the fixtures. The seed is an idempotent upsert on externalId.

---

## 8. Architecture & operability

- Compose: `db` (postgres:16-alpine, healthcheck, named volume) → `api` (`depends_on: condition: service_healthy`, then `prisma migrate deploy` → seed → start) → `web` (Next production build on **:8080**, rewriting `/api/*` → `api:3001`).
- Multi-stage Dockerfiles, **multi-arch base images** (A: ARM64 must work, since judges may be on Apple Silicon). Avoid native-build dependencies: use `@node-rs/argon2` or `bcryptjs`.
- Don't fetch anything at runtime: no Google Fonts in Next (`next/font/local` or system fonts), and no CDN scripts.
- `fixtures.json` is committed at `./fixtures/` and copied into the image.
- **Offline drill (A, B, C):** after the images are built, disconnect the network → `docker compose down -v && docker compose up` → run `run.py`. Do this **at least 3 times**: end of T1, end of T2, and before submitting. Also do one fresh-clone run on a second machine.

---

## 9. Required deliverables (union of all drafts)

Repo root: `.dogfood.toml`, `acceptance-report.txt`, `docker-compose.yml`, `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, `THREAT_MODEL.md` (or the spec's name for it), `NORMALIZATION_PROOF.md` (or a section of JUDGING.md, following the spec), `LICENSE` (MIT), and a 5-minute demo video linked in the README.

- **README:** what it is, one command, demo credentials (marked demo-only), the verification story in 5 lines, **honest limits**, and the video link.
- **JUDGING.md:** assignment + connectivity, rubric math, both normalization methods with equations and λ choices, fixture-trap handling, the proof tables (raw vs z vs bias-model rank, judge biases, flat judge, Spearman results from the synthetic test), and the audit/Merkle scheme.
- **THREAT_MODEL.md:** duplicate votes/scores (DB unique constraints), unauthorized API access (guards + e2e matrix), brute force (throttling), audit tampering (hash chain + trigger), judge conflict of interest, and **what we don't stop:** demo tokens, organizer DB-level access, judge collusion, Sybil voting (no T3).

Write docs **as features land**, not in the last 6 hours (B, C, D).

---

## 10. Schedule (UTC)

| Window | Deliverable | Exit criterion |
|---|---|---|
| **Sep 23–24** (now) | Read `spec.md` when it's released (Sep 24). Reconcile this plan against it. Decide team roles. Pre-pull Docker images. **No repo code.** | Plan updated, and everyone knows their lane |
| Fri 18:00–20:00 | Download `run.py` + `fixtures.json` and **read the checker source**. Repo, LICENSE, compose (db/api/web), Prisma schema, rewrite, health | `docker compose up` serves a page; checker runs (and fails) |
| Fri 20:00–Sat 06:00 | Fixture import (dedupe, COI flag), sessions, roles, demo tokens, gallery, project CRUD + deadline, teams/invite, event settings | **All T1 checks pass**, then offline drill #1 |
| Sat 06:00–22:00 | Rubric, assignment, judge queue + scoring UI, guards, isolation e2e matrix, progress dashboard, CSV exports, audit log writes (P1), throttling | **T1+T2 pass**, isolation tests green, offline drill #2 |
| Sat 22:00–Sun 16:00 | Engine: z-score + bias model + synthetic test; results page with rank movement + "why" drawer; flat-judge/low-confidence handling; hash chain + trigger + verify button | Proof numbers reproducible from fixtures. **Cut-line check.** |
| Sun 16:00–Mon 06:00 | P2/P3 in priority order: OpenAPI → bootstrap → Merkle → signed records/CLI | Each feature is either finished or not started, never half-built |
| Mon 06:00–15:00 | Finish docs, fresh-clone test on another machine, offline drill #3 | A stranger can run it |
| Mon 15:00–17:30 | Final `run.py` → commit `acceptance-report.txt`, set `claimed` = verified tiers, record the demo | Everything pushed |
| Mon 17:30–18:00 | Buffer. **No new features.** | Submitted before 18:00 UTC |

Re-run `run.py` after every significant merge. Any regression stops all other work.

---

## 11. Demo script (5 min, adapted from D)

1. **0:00** Problem: "40 projects, 30 judges, 8 tracks, and one judge who gives everyone the same score. Is the leaderboard fair?"
2. **0:30** Participant: a late submission is refused (show the 403 JSON), then an on-time submission to the open demo event.
3. **1:15** Organizer: rubric weights, assignment with the COI check catching the judge/team-member overlap.
4. **1:50** Judge: keyboard-driven scoring; a curl to a peer's scores returns **403**.
5. **2:30** Results: raw vs z-score vs bias-model ranking with ▲/▼. Point out the flat judge and why z-score can't handle them.
6. **3:20** "Why is this #1?" drawer (plus the stability bar if built).
7. **4:10** Audit timeline. Edit a score directly in the DB, and "Verify chain" turns red.
8. **4:45** Close: *"We don't decide who wins. We make the evidence checkable."*

---

## 12. Open questions to settle when `spec.md` lands (Sep 24)

- [ ] Exact rule on pre-kickoff code/commits.
- [ ] Is the checker contract in §3 the final one? Are route names configurable (as `.dogfood.toml` implies)?
- [ ] Is the fixtures shape final? Is the COI overlap (judge who is also a team member) real in the full file?
- [ ] Required filenames for the threat model and normalization proof bonuses.
- [ ] Team size, which decides NestJS + Next vs a single Next.js app.
- [ ] Actual prize structure (A's ₹10,000 figure is unverified).
