# Spec check: our plans vs dogfoodhack.com/spec

*Fri 25 Sep 2026, before kickoff. Checked against the published `spec.md`, the spec web page, `context.txt` (the full brief in one file), `run.py`, `fixtures.json` and `example.dogfood.toml`, all downloaded today. The plans checked are BUILD-PLAN.md, TEAM-PLAN.md and ALIGNED-PLAN.md.*

**Result:** the plans match the spec. The spec, `run.py` and `fixtures.json` are unchanged since 24 Sep, so there is nothing new to react to. The check found three small gaps, now fixed in the plans (§3), and three points that need a team decision or care (§4).

---

## 1. The five things that are actually required

| # | Spec says | Where our plan covers it | Status |
|---|---|---|---|
| 1 | "`docker compose up` brings up a working, seeded portal with the network off. No cloud accounts, no hosted database, no external API." | BUILD §5, §5.2, §11; offline drills at G1, G3 and G5 (TEAM §6) | ✔. The spec only talks about `up`; whether `build` must also work offline is still a question for Discord (§4.3). |
| 2 | OSI-approved licence, MIT or Apache-2.0 preferred | MIT (decision 13) | ✔ |
| 3 | Code written during the window; "you do not arrive with the portal already written" | Rule zero in every plan; pre-kickoff work is paper only (TEAM §8) | ✔ |
| 4 | `.dogfood.toml` at the repo root, honest claims | BUILD §12; claim `["T1","T2"]` | ✔ (one nit in §4.4) |
| 5 | `acceptance-report.txt` committed, "whatever it says" | Committed at every gate by A (TEAM §4, §6) | ✔ |
| + | README, ARCHITECTURE, DATA-MODEL, JUDGING, and a 5-minute video of "create, submit, judge, publish" | BUILD §14, §15; section owners in TEAM §4 | ✔ |

## 2. The seven checks

| Check | Spec | Our route and owner | Status |
|---|---|---|---|
| T1 gallery is public | `GET gallery`, no auth → 200 | `/api/projects`, `@Public()`, never redirects. Owner A. | ✔ |
| T1 fixture project shown | A known fixture title in the body (the code checks the first 3) | Ordered by `seed_order`; Glass Signal / Small Meadow / Deep Compass on page 1. Owner A. | ✔ |
| T1 closed event refuses | POST as participant → 4xx; "does not inspect why you refused" | `/api/events/evt_01/submissions`, deadline from the fixture, guard runs before validation. Owner A. | ✔ (rationale corrected, §3) |
| T2 judge sees own scores | 200 as judge_a | `/api/judge/scores`, judge_a = jdg_24. Owner B. | ✔ |
| T2 peer scores refused | 401/403 as judge_b — "the one that matters most" | `/api/judges/jdg_24/scores`, deny first, never 404. Owner B. | ✔ |
| T2 participant blocked | 401/403 | Role check before any query. Owner B. | ✔ |
| T2 CSV export | 200 + a CSV body (the code checks for a comma in line 1) | `/api/events/evt_01/export/scores.csv`. Owner B. | ✔ |
| Seed prints the four headers on boot | "Make your seed script print these four headers" | Decision 33; fixed bearer tokens, no `#` | ✔ |

## 3. Gaps found and fixed in the plans

| Gap | Spec evidence | Fix applied |
|---|---|---|
| **Repo layout.** We planned `apps/` + `packages/`. The spec's figure of what they open when they clone us shows `src/` ("all code written during the window") and `tests/` ("your own test suite, beyond the acceptance one"). | Spec page "What we open when we clone you"; `context.txt` §7 | Code now lives in `src/api`, `src/web` and `src/judging-engine`; e2e and isolation suites in root `tests/`. TEAM §3.1 and BUILD decision 2 updated. The layout is advisory ("any shape"), but matching it costs nothing before kickoff and meets reviewers' expectations. |
| **We would have committed `run.py`.** It's the organisers' file, with no licence, and they run their own copy. | "We run the same checker" | `npm run acceptance` downloads the official `run.py` into a git-ignored `.cache/` (TEAM §3.4). `fixtures.json` is still committed, because the portal must load it offline. |
| **Check 3 rationale overstated.** BUILD said the refusal "must" come from the deadline for the checker's sake. | "It does not manipulate a clock, and it does not inspect why you refused." | BUILD §12 reworded. We keep deadline-first because it's the honest answer to a curl, not because the checker needs it. |

## 4. Needs a decision or care

### 4.1 Proposed decision 63: top-up assignments at seed time
The spec's T2 asks for "a live organizer progress dashboard" (the website adds "so an organizer can see who has not started"). The fixtures contain **only completed scores, no assignment list**. On seeded data, the dashboard would show every judge 100% done: a dashboard with nothing to show. Meanwhile the spec says "two review batches nobody finished" (8 projects have only 2 reviews).

**Proposal:** after import, the seed runs the assignment algorithm once as a labelled, audited batch (`seed-topup`) that brings every project up to k = 3 with eligible judges. It uses a seeded RNG, so it's deterministic. The dashboard then shows real outstanding work, and the judge console has real queues to demo. Imported reviews are untouched. None of the 7 checks are affected (judge_a's scores still return 200). **Owner:** B (assignment) + A (seed hook). About an hour. *Accept or reject at the kickoff call.*

### 4.2 Taking credit for T3-style safeguards without overclaiming
The spec lists "rate limits, duplicate detection, audit trail" under **T3**. We build all three for integrity reasons (decisions 24, 53, 55, plus the duplicate flags), but we claim only T1 + T2. In the README's "Honest limits" section, say it plainly: *"We did not build community voting, so we don't claim T3. The anti-abuse pieces T3 lists (rate limits, duplicate detection, a readable audit trail) are present and cover judging."* We get credit for what exists without claiming a tier.

The **Threat Model bonus** asks for "a written defence against Sybil votes, ballot stuffing, collusion and similar". With no voting built, the Sybil and ballot-stuffing parts can only be design, not code. It's still worth writing (it's already in BUILD §10), but don't count on it as a tiebreaker. The Normalization Proof is our bonus.

### 4.3 Offline build (still open)
The spec only requires `up` with the network off. Ask on Discord before 18:00 UTC: *"Must `docker compose build` also work offline, or only `up` after a first online build?"* Our plan works for "only `up`". A committed npm cache is the fallback only if they say yes (BUILD §11).

### 4.4 Small things
- **41, not 40.** The spec says "forty projects"; the file has 41 because of the Dry Harbour duplicate. Say so once in README and DATA-MODEL so nobody thinks the import is wrong.
- **`.dogfood.toml` length.** The spec says "six to fifteen lines". Ours is 15 content lines plus blank lines, which is fine. Don't add comments to it.
- **The fixture example.** `ada@example.org` as judge and team member appears only in the spec's 3-record sample, not in the real file (checked 24 Sep; still true today).

## 5. Tier lists and scoring, line by line

**T1:**
- Auth + sessions → decision 8
- Five roles → decision 9
- Events with dates, tracks and prizes → A, H8–24
- Invite-link teams → A + C
- Draft and edit until the deadline → decision 30
- Deadline that holds → decisions 30, 48
- Public gallery with search and filter → A + C

All ✔.

**T2:**
- Judge invitation and assignment → B
- Weighted, organiser-configurable rubric → decision 31, B + C
- Backend isolation → decisions 15, 16, 34
- Live progress dashboard → decision 37 (+63)
- Documented normalization → §7, JUDGING.md
- CSV export → decision 32

All ✔.

**Scoring criteria:**

| Criterion | Weight | Where our plan covers it |
|---|---|---|
| Tier completion | 40% | Gates plus the committed report |
| Judging integrity | 25% | Isolation matrix; ridge model with proof; readable audit page (C) + trigger; rate limits; threat model |
| Adoptability | 20% | One command; offline drills; export-event round trip; CSVs; backup/restore; README a stranger can follow; MIT |
| Code quality & innovation | 15% | Idiomatic Nest (guards, modules, DTOs); hand-written DATA-MODEL; ADRs; the Ranking Receipt as "a decision worth stealing" |

**Out-of-scope list:** none apply. There's a real backend; no hosted services; isolation is enforced in the backend and tested by curl-style e2e; gallery and judging are one product; MIT; new code; no special hardware.

**Prizes:** Best Judging Engine is judged on "most defensible assignment, normalization and isolation". That is exactly B's and A's core work, so no change is needed.
