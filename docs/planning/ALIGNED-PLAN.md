# DOGFOOD 2026 — Aligned Plan (BUILD-PLAN × MASTER-PLAN)

*Thu 24 Sep 2026. Pre-kickoff planning only. No project code before Fri 25 Sep, 18:00 UTC.*

**How to read this.** `BUILD-PLAN.md` is the base and stays the source of truth. It was written after reading the real spec, `run.py` and `fixtures.json`, and after two council reviews. `MASTER-PLAN.md` was written from four second-hand drafts, before any of that. This file does four things:

1. corrects `MASTER-PLAN.md` wherever it conflicts with the real sources;
2. lists the `MASTER-PLAN.md` ideas worth adding to `BUILD-PLAN.md`, as proposed decisions **55–62**;
3. flags a few issues inside `BUILD-PLAN.md` itself;
4. gives one merged priority list and one merged schedule.

Once decisions 55–62 are accepted, copy them into BUILD-PLAN §4 and retire `MASTER-PLAN.md`.

---

## 1. Verified today against the published sources

`fixtures.json` and `run.py` were re-downloaded on 24 Sep and checked with a throwaway script, kept outside the repo.

| Claim | BUILD-PLAN | MASTER-PLAN | Verified |
|---|---|---|---|
| Counts | 41 projects, 30 judges, 40 teams, 8 tracks, 126 scores | "≈40 projects" | **41 / 30 / 40 / 8 / 126** ✔ BUILD |
| First three titles (check 2) | Glass Signal, Small Meadow, Deep Compass | "first 3 fixture projects" | ✔ |
| Deadline | 2026-03-01T18:00:00Z | "a past date" | ✔ |
| Flat judge | jdg_07, 4/4/4 on 3 projects | "a judge who gives every project the same score" | ✔ jdg_07 |
| Duplicate | Dry Harbour (prj_07 / prj_41) | "one duplicate" | ✔ only duplicate title |
| Most-scoring judges | jdg_24 (11), jdg_26 (10) | "judge with most scores" | ✔ |
| Single-score judges | "two judges" | – | ✔ jdg_01, jdg_23 |
| Criteria / range | functionality, innovation, quality; values 2–5; no weights; no timestamps | – | ✔ |
| **Judge who is also a team member** | "none overlap" | Listed as a fixture trap (`ada@example.org`) | **✘ MASTER is wrong.** Judge emails ∩ team-member emails = ∅. The overlap existed only in the Tally draft's *example* JSON. |
| Checker follows redirects | Yes (urllib) | "3xx fails" | ✔ A 302 to a login page returns 200 and **fails** checks 3 and 5. |
| Fallback TOML parser strips `#` | Yes | – | ✔ `raw.split("#")[0]`. No `#` in tokens or the pitch. |

---

## 2. Decision alignment, topic by topic

**Status key:** **BUILD** = keep BUILD-PLAN's decision. **Add** = new decision from MASTER-PLAN. **Fix** = change to BUILD-PLAN.

| Topic | BUILD-PLAN | MASTER-PLAN | Aligned decision | Status |
|---|---|---|---|---|
| Pre-kickoff code | Forbidden (homepage FAQ) | Forbidden (unconfirmed) | Forbidden. Confirmed by the FAQ. | BUILD |
| Tier target | T1 + T2 only; T3 cut | T1 + T2; T3 at P4 | T1 + T2. **T3 cut.** | BUILD |
| Stack | Django 5 + Ninja + HTMX + Pico, Postgres 16, 2 containers | NestJS + Next.js + Prisma, 3 containers | **NestJS + Next.js + Prisma + Postgres 16**, one public port (updated 24 Sep, user decision: team fluency). BUILD-PLAN §5 has been rewritten, including the stack-specific traps in §5.2. | MASTER (user decision) |
| Checker auth | Fixed `Authorization: Bearer dev-…` tokens, hashed, off when `DEMO_MODE=false` | Fixed `Cookie: session=demo_…` | **Bearer tokens.** Browsers keep sessions + CSRF. | BUILD |
| Routes | `/projects`, `/api/events/evt_01/submissions`, … | `/api/projects`, … | BUILD's routes, but the gallery check now points at the public `/api/projects` JSON. The spec says route names are unchecked. | BUILD |
| Normalization model | Joint additive ridge, **closed-form** (Cholesky in TypeScript, originally numpy), **λ picked by leave-one-review-out** | Same model via iterative ALS, **fixed** λ_b = 2, λ_q = 0.5; z-score shipped as a second method | Ridge, closed form, λ by LOO. **z-score is not a product method.** It appears only as a comparison column in the proof and the synthetic test (decision 56). | BUILD + Add |
| Flat judge (jdg_07) | Model absorbs the offset; low-variance flag only | Down-weight to 0.1 | **No re-weighting.** The 0.1 weight was arbitrary and can't be defended. The model handles jdg_07 without dividing by σ. | BUILD |
| Uncertainty | Posterior SD + tie groups | SE + bootstrap stability (stretch) | Posterior SD + tie groups. **Bootstrap dropped**: 2–5 reviews per project can't support it. Tie groups need a fix (decision 59). | BUILD + Fix |
| Explainability | Ranking Receipt: raw vs normalized, rank change, one-line reason, SHA-256 | "Why is this #N?" drawer, judge bias table | Same feature. Use the Receipt as the drawer's content. Add neutral wording (decision 60). | BUILD + Add |
| Duplicate policy | Keep **latest** (prj_41); unique reviews move across; overlapping reviews superseded; organiser confirms | Keep **earliest** | **Keep latest.** The user decided this. It preserves jdg_01's only score and counts no judge twice. | BUILD |
| Conflict of interest | Block list in assignment | "Flag the ada@example.org overlap" | Block list only. There is no overlap in the fixtures, so it isn't a demo moment. | BUILD |
| Audit log | Append-only + Postgres trigger; hash chain = stretch #1 | Hash chain at P1 | Append-only + trigger at T2. **Hash chain stays stretch #1, but do it first once G4 is green** (≈2h, since the trigger already exists). | BUILD |
| Merkle / Schnorr / verify CLI | Late stretch | P3 | Late stretch. | BUILD |
| Rate limiting | Only mentioned in the threat model ("rate-limit the API") | Throttle login + score writes during T2 | **Add** (decision 55). | Add |
| Threat model location | Section of JUDGING.md | Separate `THREAT_MODEL.md` | Section of JUDGING.md titled **"Threat model"**, linked from the README. The spec names no filename. | BUILD |
| Normalization Proof location | JUDGING.md + proof script (after kickoff) | `NORMALIZATION_PROOF.md` | JUDGING.md + `cli proof`, which writes the tables to `docs/proof/`. | BUILD |
| Bonus focus | Normalization Proof | Proof + Threat Model (+ API First) | Proof is the focus. The threat model gets written anyway. Claim API First only if the coverage checklist is complete (decision 62). | BUILD + Add |
| Pairwise mode | Rejected: no pairwise data | Last priority | Rejected. JUDGING.md explains why. | BUILD |
| Offline test | At G5 (H46–56), always from `down -v` | 3 drills: end of T1, end of T2, before submission | **Run the drill at G1, G3 and G5** (decision 57). | Add |
| Prizes | $2,500 pool; Best Judging Engine $100 | ₹10,000 unverified | BUILD. ₹10,000 was wrong. | BUILD |
| Demo video | create → submit → judge → publish, Wi-Fi off | Problem-led script; the "edit DB → chain turns red" moment | BUILD's lifecycle script (the spec requires it). The DB-tamper moment goes in only if the hash chain ships. | BUILD |
| Extra docs | DECISIONS.md, AI-use disclosure, git tag, follow-up readiness | – | Keep all of them. | BUILD |
| Deadline before validation | Decision 48 | Same | Same. | Agreed |
| Deny-first (403, never 404) | Decision 34 | Implied | Decision 34. | Agreed |
| Connectivity report, synthetic test, low-evidence badge, DB-enforced audit | Decisions 51–54 | Same ideas | Same. | Agreed |

---

## 3. Proposed new decisions (55–62) for BUILD-PLAN §4

| # | Decision | Final choice | Reason |
|---|---|---|---|
| 55 | Rate limiting | `@nestjs/throttler` with its in-memory store (one API instance; no Redis): login, bearer-auth failures, review writes and CSV exports. Over the limit → **429**, and an audit row. Values are env-configurable. | Makes "rate-limit the API" in the threat model true. About an hour of work. Doesn't touch the 7 checks. |
| 56 | z-score as a named comparator | The proof table gets a per-judge z-score column (σ = 0 → documented fallback z = 0). The synthetic recovery test (decision 52) asserts that ridge beats **both** raw mean **and** z-score on Spearman ρ. | Turns "z-score breaks on jdg_07" from an argument into a measurement. Most teams will ship z-scores; this shows why ours is better. |
| 57 | Offline drill cadence | `down -v` → network off → `up` → `run.py` at **G1, G3 and G5** on arm64, plus x86 at G5 if available | Prisma CLI/engine, Next.js font or architecture problems found at H50 are the most expensive bug in the plan. |
| 58 | Single `fixtures.json` location | Commit it at `data/fixtures.json`, next to where `run.py` looks (`<config dir>/data/fixtures.json`). The importer reads the same file. | `run.py` searches `./`, beside itself, beside the config, and `data/`. One copy means no drift. |
| 59 | Tie groups without chaining | Start a new group whenever a project's score is more than one pooled SD below **the first project in the current group**, not the adjacent one | Comparing each project only to its neighbour chains: with 41 close scores, the whole table can collapse into one "tie". |
| 60 | Neutral bias wording | UI and Receipt say "scores +0.4 above panel average", never "lenient/harsh/biased judge". The flag text for jdg_07 is "low score variance". | Judges on the panel run evaluation systems. Labelling a real person's judging style is a risk to our reputation, and it isn't supported by 3 reviews. |
| 61 | CSV trap, restated | `run.py` only checks `"," in first_line`, so a BOM is harmless to the checker. The real traps are a **one-column header**, an **HTML error page**, and a **302 to login**. Keep "UTF-8, no BOM" (decision 32) for Excel and pandas users, not for the checker. | Corrects the stated reason for decision 32; the choice itself stays. |
| 62 | API-First coverage list | Keep a table in ARCHITECTURE.md: UI action → Nest endpoint (OpenAPI via `@nestjs/swagger`). Claim the API First bonus **only** if every row is filled at the freeze. | Decision 43 makes this nearly free. The checklist keeps the claim honest. |

---

## 4. Issues in BUILD-PLAN to resolve

1. **Tie-group chaining** (fixed by decision 59).
2. **CSV BOM rationale** is slightly wrong (decision 61). No change in behaviour.
3. **Offline test comes late** (decision 57).
4. **An offline `build` would be the costliest part of the offline story.** With npm it means committing an offline package cache. **Don't do it unless Discord answers that `build` must work offline, not just `up`.** If only `up`, pinned image digests plus images built once are enough.
5. **The rate limit has no owner** (decision 55).
6. **`fixtures.json` location isn't specified** (decision 58).
7. **Scale is a known gap.** Judge "scale" (stretch or compression) is correctly listed as unmodelled. Put it under README "Honest limits" as well as JUDGING.md, so a reviewer doesn't find it first.

---

## 5. What gets retired from MASTER-PLAN

Don't carry these into the build:
- Cookie-session checker tokens and `/api/projects` routes
- Iterative ALS with fixed λ; the 0.1 flat-judge weight
- Shipping z-score as a user-facing method; `50 + 15z` display scale
- Bootstrap rank stability
- "Keep earliest" duplicate rule
- The `ada@example.org` conflict-of-interest "trap"
- `THREAT_MODEL.md` / `NORMALIZATION_PROOF.md` as separate files
- T3 voting as P4
- ₹10,000 prize and the open questions §12 (all answered by BUILD-PLAN §1)

What MASTER-PLAN contributes: the stack (NestJS + Next.js, chosen by the user on 24 Sep), plus decisions 55–62: rate limiting, the z-score comparator, drill cadence, neutral wording, and the ordering argument for putting the hash chain first among the stretch items.

---

## 6. Merged priority list

**Must (gates G1–G5):** the 7 checks green with deny-first → full T1 field set, deadline on every write verb, open demo event → assignment, weighted rubric, judge console, progress dashboard, CSV at every stage, append-only audit + trigger, **rate limits (55)** → ridge model with λ by LOO, Receipt, tie groups (59), connectivity, low-evidence badge, synthetic test vs raw **and z-score (56)**, publish → Dry Harbour merge, backup/restore/healthz, offline drill from a clean volume (57) → docs, video, tag.

**Stretch, in order:**
1. Hash-chained AuditLog + hashed published RankingRun
2. Judge's own score histogram
3. What-if UI (λ slider, normalization on/off)
4. Webhooks
5. Devpost CSV importer
6. Calibration overlap in assignment
7. Merkle root / signed judge records / `verify` CLI

**Never this weekend:** T3 voting, pairwise mode, bootstrap stability.

---

## 7. Merged schedule (H0 = Fri 25 Sep 18:00 UTC)

| Hours | Build | Gate |
|---|---|---|
| H0–8 | Skeleton, compose, models from hand-written DATA-MODEL.md, importer reading `data/fixtures.json` (58), fixed tokens, 7 check endpoints, run.py in CI, DECISIONS.md | **G1:** 7/7, report committed, **offline drill #1** (57) |
| H8–24 | T1 breadth (roles, events/tracks/prizes, invites, drafts, field set, custom questions, deadline on every verb, gallery search/filter, open demo event) | **G2:** still 7/7 |
| H24–36 | T2: assignment, rubric editor, judge console, dashboard, CSV everywhere, audit page + trigger, **rate limits (55)**, isolation test matrix | **G3:** report + **offline drill #2** |
| H36–46 | Ridge + LOO λ, Receipt, tie groups (59), connectivity, badge, synthetic test vs raw and z-score (56), `cli rank`, publish, `cli proof`, JUDGING.md | **G4:** proof reproduces; ρ > 0.9 and beats both baselines |
| H46–56 | Dry Harbour merge/unmerge, backup/restore/healthz, threat model section, **hash chain if ahead**, draft video at H54 | **G5:** fresh clone, clean volume, offline, arm64 (+ x86) |
| H56–68 | README (quickstart, honest limits incl. judge scale, AI-use disclosure), final DATA-MODEL.md, API coverage table (62), final video | Docs complete |
| H68–72 | **Freeze at H70:** run.py, commit report, `git tag v1.0-freeze`, submit | Submitted |

---

## 8. Before kickoff (today and tomorrow)

- [ ] Accept or reject decisions 55–62, then copy them into BUILD-PLAN §4.
- [ ] Discord: offline `build` vs `up` (this decides item 4 in §4); how to present T3/T4 claims.
- [ ] Solo or pair: decide today (BUILD-PLAN open question).
- [ ] Hand-work the ridge model on jdg_07 + jdg_01 + jdg_23, and add the z-score column for comparison.
- [ ] Draft the tie-group rule (59) and the neutral-wording strings (60) into the JUDGING.md outline.
- [ ] Pre-pull `node:24-bookworm-slim` and `postgres:16`. Re-read BUILD-PLAN §5.2 (stack traps). Make no repo commits.
