# DOGFOOD 2026 — Build Plan

*Last updated: Thu 24 Sep 2026 (stack changed to NestJS + Next.js, see §3 item 7) · Status: final after council review v2 · Owner: chukwumachris751@gmail.com*

This is the single source of truth for the build. It holds four things:

- the full hackathon context;
- every design decision with its reasoning;
- the research behind the judging engine;
- the plan hour by hour.

Keep adding to it during the build. After the build it becomes the raw material for README, ARCHITECTURE.md, DATA-MODEL.md, JUDGING.md and the Write Up Quest entry.

> **Rule zero.** Before **Fri 25 Sep 2026, 18:00 UTC**, write **no project code** and **commit nothing** to the submission repo. Planning, schemas, reading, choosing a stack and tuning prompts are allowed. "Any project code committed before kickoff disqualifies the submission" (homepage FAQ). This file is a planning document. Keep it out of the repo's git history until after kickoff, or add it in the first post-kickoff commit.

---

## Contents

1. [The hackathon: full context](#1-the-hackathon-full-context)
2. [The fixture data, analysed](#2-the-fixture-data-analysed)
3. [How we got here: decision history](#3-how-we-got-here-decision-history)
4. [Final decision set](#4-final-decision-set)
5. [Architecture and stack](#5-architecture-and-stack)
6. [Data model](#6-data-model)
7. [Judging engine](#7-judging-engine)
8. [Duplicate submissions](#8-duplicate-submissions)
9. [Judge assignment and the judge console](#9-judge-assignment-and-the-judge-console)
10. [Security, role isolation and threat model](#10-security-role-isolation-and-threat-model)
11. [Adoptability and operations](#11-adoptability-and-operations)
12. [The acceptance checker: mapping and traps](#12-the-acceptance-checker-mapping-and-traps)
13. [The plan: pre-kickoff and the 72 hours](#13-the-plan-pre-kickoff-and-the-72-hours)
14. [Demo video script](#14-demo-video-script)
15. [Deliverables checklist](#15-deliverables-checklist)
16. [Risks and mitigations](#16-risks-and-mitigations)
17. [Open questions](#17-open-questions)
18. [Write Up Quest kit](#18-write-up-quest-kit)
19. [Research and acknowledgements](#19-research-and-acknowledgements)
20. [Sources](#20-sources)

---

## 1. The hackathon: full context

Sources: the [homepage](https://dogfoodhack.com/), the [spec](https://dogfoodhack.com/spec/) ([spec.md](https://dogfoodhack.com/spec/spec.md)), [run.py](https://dogfoodhack.com/spec/run.py), [fixtures.json](https://dogfoodhack.com/spec/fixtures.json), [example.dogfood.toml](https://dogfoodhack.com/spec/example.dogfood.toml) and the [Discord](https://discord.gg/xfYPDZYqeh). All were read in full on 23 Sep 2026.

### 1.1 The event

| Item | Detail |
|---|---|
| Name | DOGFOOD 2026. Tagline: "Build the platform that will judge you." |
| Organiser | Hackathon Raptors ([raptors.dev](https://raptors.dev)), a UK Community Interest Company (No. 15557917). They have run 35 events since Sep 2023 in 85+ countries, about 12 a year. Contact: hello@raptors.dev |
| Format | Online, 72 hours, free. Teams of 1–4. "Solo welcome, though this brief rewards a pair", and 2–3 people are recommended because "the tier ladder splits cleanly across a frontend and a backend". |
| Prize pool | USD 2,500 |
| Product | Every team builds the same thing: an open-source, self-hostable submission and judging portal |
| What the winner gets | "The winning project is the one we run." Raptors fork it, self-host it and run their events on it for "the next decade". The team keeps ownership: no assignment, CLA or exclusivity. The team is credited on every event page the portal powers. Raptors send all their fixes back as pull requests. If two entries are close, they may adopt one and borrow ideas from another, and will say so publicly with credit to both. |

### 1.2 The premise: why this event exists

- **Ten-stage pipeline.** Registration → Teams → Submissions → **Eligibility** → Assignment → Scoring → **Normalization** → Results → Certificates → Archive. The homepage labels Normalization "FAILURE SURFACE: STAGE 07". It adds: "Get one wrong and the part that suffers is the judging, which is the part participants actually came for."
- **The incumbents converged on the same product.** Devpost, Devfolio, TAIKAI, DoraHacks, HackerEarth and Unstop all ship the same nine features: a microsite, registration, team formation, submission, a public gallery, judge scoring, community voting, an organiser dashboard and CSV export.
- **Then they stopped improving it:**
  - Devpost, the market leader, cannot weight criteria. It tells organisers who need weights to judge offline in a spreadsheet.
  - Devfolio advertises "automatic score normalization" and publishes nothing about how it works. It also uses one fixed five-criterion rubric for every event.
  - Community voting is treated as a known way to game results. The standard advice is to keep the prize small and hide results until someone reviews the votes manually.
  - No platform has an official public API. Integration runs on scrapers and CSV files.
  - Pricing is only available through a sales call.
- **The judging workload is heavy.** "5 hours for one judge to score 30 projects", by the largest platform's own estimate.
- **Open-source tools exist but don't add up to a platform.** Gavel, from HackMIT, uses pairwise comparison with a Bradley-Terry/Crowd-BT model. JunctionApp, Dribdat, Quill and Hibiscus exist and can be self-hosted. "What nobody has assembled is a modern, self-hostable, API-first whole that a working organizer can run on Monday."
- **Their framing:** "We are not asking you to build a demo of a platform. We are asking you to build ours." And: "Generating a CRUD app is trivial now. Building an evaluation system that is fair, that enforces its own rules, that an organizer can actually operate… is the part that still takes engineers."

### 1.3 The tier ladder, in full

There are no tracks. It is one product with four tiers.

**T1 — Core (required; a submission that doesn't clear T1 is not judged)**
- Authentication and sessions
- A real role model: visitor, participant, judge, organizer and admin
- Event creation with configurable dates, tracks and prizes
- Team formation by invite link
- Project submission that can be drafted and edited until the deadline
- Deadline enforcement that actually holds
- A public gallery with search and filter
- Reference field set, "stable across every platform we studied": name, tagline, long description, thumbnail, image gallery, hosted demo video URL, repository URL, live link, tech tags, track, and organiser-defined custom questions

**T2 — Judging ("where the real engineering starts")**
- Judge invitation and assignment, "by batch or algorithmically"
- Scoring against a **weighted** rubric the organiser configures. The market leader can't weight criteria at all, and its closest rival ships one fixed five-criterion rubric.
- **Role isolation enforced in the backend.** "A judge must never see another judge's scores. A track judge must never see another track. If this only works because the UI hides a button, it does not work."
- A live progress dashboard, "so an organizer can see who has not started"
- Cross-judge normalization, "with your method documented and defended"
- CSV export **at every stage**

**T3 — Public**
- Community voting with configurable access: an open link, email-gated, or authenticated
- "Or something better than one-person-one-vote, if you can defend it." The page calls quadratic voting "the most credible attempt anyone has shipped at stopping a loud minority from deciding the outcome".
- Comments on gallery projects
- Results hidden from everyone except organisers while voting is open
- Randomised project order on ballots, "to kill position bias"
- Anti-abuse that means something: rate limits, duplicate detection, and an audit trail an organiser can read without a database client

**T4 — Stretch**
- A REST API and webhooks covering every action the UI can take
- Certificate and record generation
- Signed, publicly verifiable judge participation records
- An embeddable gallery widget
- Bulk import and export, "so an organizer can leave as easily as they arrived"

**Role isolation matrix** (homepage Fig. 02; "denied at the API, not in the UI"; verified by acceptance check T2.03):

| Actor | Own scores | Peer scores | Other track | Aggregate | Audit log |
|---|---|---|---|---|---|
| Visitor | ✗ | ✗ | ✗ | ✗ | ✗ |
| Participant | ✗ | ✗ | ✗ | ✗ | ✗ |
| Judge | ✓ | ✗ | ✗ | ✗ | ✗ |
| Organizer | ✓ | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ |

**Judge assignment** (homepage Fig. 04): "batched, disjoint", 40 projects, 30 judges, **3 reviews per project**, and "no judge sees a peer's ballot".

### 1.4 How entries are scored

Each project gets a 1–5 score on four weighted criteria, averaged across the judges who reviewed it.

| Criterion | Weight | What they say |
|---|---|---|
| Tier Completion & Correctness | 40% | Verified by the acceptance suite, not the README. T1 is a gate, not a score. "A clean T2 outranks a T4 with three features that half-work." Honest reporting of gaps is rewarded; inflated claims are penalised. "Claim T3 in your README and pass T2 in the report, and you score T2 with a note about the gap." |
| Judging Integrity | 25% | "The hard part, weighted like it." Is isolation enforced in the backend or painted on? Is normalization documented and defensible, "or did you average the scores and hope?" Is there an audit trail an organiser can read? Did you think about vote abuse before a judge asked? |
| Adoptability & Operability | 20% | "Could we run this on Monday?" One command, seeded with real data, docs a stranger can follow "without asking you a question", a way to migrate in and out ("a platform you cannot leave is a trap"), and a clean license. |
| Code Quality & Innovation | 15% | Idiomatic to a senior reviewer, a schema "a database person would defend", and "the decision that made a judge stop and say they would steal it". Design counts here and under Adoptability: "a judge console that makes 30 reviews bearable is a real contribution". |

**JUDGING.md feeds straight into Judging Integrity.** Two quotes set the bar: "'We averaged the scores' is an answer, and it is a weak one." And: "**Tell us what you did about the judge who marks everything a 3.**"

The homepage scoring figure shows raw judge spread σ = 0.94 "uncalibrated", then σ = 0.31 "normalized, method documented", with rank movements (▲4, ▲1, ▼3, ▼6). That is the kind of evidence they expect to see.

**Bonus challenges** break ties and decide the Best Judging Engine prize. They never change the score. The advice is "pick one and nail it… done properly beats four started".

| Challenge | Difficulty / points | Requirement |
|---|---|---|
| Normalization Proof | Hard, +5 | Implement cross-judge normalization and prove it on the fixtures. Show raw scores, normalized scores and the ranking change. Document it "well enough that a statistician would not wince". |
| Pairwise Mode | Hard, +5 | Show a judge two projects, ask which is better, and recover a global ranking with a Bradley-Terry-style estimator |
| Threat Model | Medium, +3 | A defensible written model covering Sybil votes, ballot stuffing, submission scraping, judge collusion and deadline gaming. "Name the attacks you stopped, and name the ones you did not." |
| API First | Medium, +3 | Every UI action available through a documented API with a published OpenAPI spec |

### 1.5 Rules

1. **Open source, OSI-approved.** MIT or Apache-2.0 preferred, so they can adopt "without a legal conversation". Copyleft is allowed and costs no points. The code must be public at submission, and the team keeps ownership.
2. **One command to running.** `docker compose up` brings up a working, seeded portal on a laptop. An equivalent single command is fine if the README says so clearly. "If a judge has to read your CI config to figure out how to start it, you have failed this rule."
3. **Clear T1 or you are not judged.**
4. **New code only.** All project code is written during the 72-hour window. Frameworks, libraries, boilerplate generators and AI are fine. A pre-existing project, or a renamed open-source platform, is not.
5. **No hosted-service dependency.** It must run offline on a laptop. Explicitly excluded: hosted databases, auth-as-a-service ("the same problem wearing a nicer hat") and staging URLs ("we need to run it, not visit it"). "Works on my machine has never once been true."
6. **Claim tiers honestly** in `.dogfood.toml`. "Overclaiming costs more than the tier was worth."
7. **Team size** 1–4.
8. **Public GitHub repo.** Anonymous usernames are fine, but the team must be reachable for written follow-up from judges during the evaluation window.
9. **AI tools are expected**, e.g. Claude Code, Cursor, Aider, Copilot or local models. "We gatekeep on whether the thing holds up and whether somebody on the team can defend the schema in writing."

**Out of scope, and scored as nothing:**
- Mockups, Figma files, or a frontend over hardcoded data
- Anything that needs a cloud account, hosted database or auth provider
- An auth demo that stops at the login screen
- A gallery with no judging, or judging with no gallery ("this is one product")
- Frontend-only role checks: "if I can curl another judge's scores it is not isolation"
- "LLM dumps with no architecture document and nobody able to defend the schema in writing"
- Closed source, or a license that isn't OSI-approved
- Custom hardware, GUI toolchains or proprietary services
- A renamed rewrite of an existing open-source platform

### 1.6 The four files that interface with the organisers (spec)

- **`.dogfood.toml`** (6–15 lines, repo root). It holds `[portal] base_url`; `[tiers] claimed` and `pitch`; `[auth]` headers for `organizer`, `judge_a`, `judge_b` and `participant` (the checker never logs in, it only attaches these); and `[routes]` for `gallery`, `submit`, `judge_scores`, `peer_scores` (the URL that returns judge A's scores) and `csv_export`. On Python < 3.11 the checker's fallback parser cuts everything after `#`, so **tokens must not contain `#`**.
- **`fixtures.json`**. Everyone loads the same data, so judges compare software, not demo data. It is "input, not your data model". It deliberately includes a flat judge, incomplete batches and a duplicate entry. "If your portal only works on tidy input, you will find out on Friday rather than on Monday." It is analysed in section 2.
- **`run.py`**. Python 3 standard library only. Run it as `python3 run.py .dogfood.toml [--fixtures path]`. It makes 7 requests; see section 12.
- **`acceptance-report.txt`**. The output of run.py, committed "even if it has failures". "A report with two honest FAIL lines reads better than a README claiming everything works." Organisers run the same checker.

**Discrepancy.** The homepage timeline says fixtures and the suite are "released at kickoff". The spec says "nothing is held back" and both are already downloadable. We have both, fetched 23 Sep.

**What is not checked:** language, framework, database, ORM, schema, route names, CSS, repo layout, commit style, branch names, how many tests, whether AI was used, how work was split, sleep. "Pick what you know."

The spec also names "the five things that are actually required":
1. `docker compose up` gives a working, seeded portal with the network off
2. An OSI license
3. Code written during the window
4. `.dogfood.toml` with honest claims
5. `acceptance-report.txt` committed

On top of those come README, ARCHITECTURE.md, DATA-MODEL.md, JUDGING.md and the demo video.

### 1.7 Deliverables

Repo layout ("advisory; judges read what you actually ship"):

```
your-portal/
├── README.md              what it does, how to run, honest limits
├── ARCHITECTURE.md        the shape of the system and why
├── DATA-MODEL.md          schema, import and export paths
├── JUDGING.md             assignment, scoring maths, normalization, defended
├── docker-compose.yml     one command to a seeded, running portal
├── src/                   all code written this weekend
├── tests/                 your own tests, beyond the acceptance suite
├── acceptance-report.txt  the suite's output, tier by tier
├── LICENSE                MIT or Apache-2.0
└── .dogfood.toml          tiers claimed, one-line pitch
```

Plus a **5-minute demo video** of one full event lifecycle: **create, submit, judge, publish**.

### 1.8 Timeline (UTC)

| When | What |
|---|---|
| 24 Aug 2026 | Registration opened; Discord open |
| 4 Sep | Judging panel announced |
| 21 Sep | Team formation |
| 23 Sep (today) | Raptors Conference: online, free, unrelated event |
| 24 Sep | spec.md published |
| **Fri 25 Sep, 18:00** | **Kickoff (T-0)**. Their suggested arc: schema/auth/submission → judging/normalization → acceptance/docs/video |
| **Mon 28 Sep, 18:00** | **Code freeze.** Submissions due; acceptance reports verified |
| 28 Sep → 8 Oct | Judging window. The panel reviews 29 Sep – 8 Oct: 11 days, 3 reviews per project, structured forms, weighted scores and written feedback to every team |
| **Sun 5 Oct, 18:00** | Write Up Quest closes |
| Fri 9 Oct | Winners and the adoption decision announced |

### 1.9 Prizes

| Prize | USD | What they say |
|---|---|---|
| 1st, Grand Prize | 800 (32%) | "The portal that cleared the ladder honestly, enforced its own rules in the backend, started with one command, and read like software somebody intends to maintain." Forked and put into production. |
| 2nd, Runner-Up | 500 | Strong tiers, "defensible judging maths, documentation that respects the reader" |
| 3rd | 350 | "How far it climbed in 72 hours or… one decision nobody else made" |
| 4th | 200 | "Honest scope, no shortcuts hiding in the backend" |
| 5th | 150 | "Something in this build works better than it had any right to" |
| Best Judging Engine | 100 | "Assignment strategy, normalization method, role isolation, audit trail" |
| Write Up Quest | 4 × 100 | See §18 |

### 1.10 The judges

There is a 36-seat panel: "senior engineers, architects and technical leaders who have built and operated evaluation systems, run production software at scale". Employers include Microsoft, AWS, Meta, Walmart, Adobe, Wise, GoDaddy, Avito, T-Bank, Yahoo, Lululemon, GuardSpine, Analog Devices, ChargePoint, Martin Marietta and others.

The featured bios lean heavily on security, identity, data integrity ("where data models either hold or quietly lose records"), infrastructure and DevOps, production readiness, and Rust-style reading of state and error paths.

**Implication:** write for sceptical senior reviewers. Cover failure modes, data integrity, operations and exact claims. "Judges never see one another's ballots. The platform you build has to hold that line too."

### 1.11 Suggested starting points (homepage)

| Background | Suggested path |
|---|---|
| Full-stack | T1 → T2 |
| Backend and API | T2 → T4 ("role isolation that survives a curl, assignment algorithms, an export path that does not lose data") |
| Frontend | T1 → T3 ("the judge console and the public gallery are the product") |
| Data and algorithms | T2 plus the bonuses ("Bradley-Terry, Crowd-BT, or something better you can defend") |
| Security | T2 → T3 plus the Threat Model |
| DevOps | T1 → adoptability ("20% of the score and the reason the winner gets adopted") |

---

## 2. The fixture data, analysed

Analysed with a throwaway script on 23 Sep. This is analysis, not project code, and nothing was committed.

| Item | Value |
|---|---|
| Event | `evt_01` "Sample Hack 2026". `submissions_close` = **2026-03-01T18:00:00Z** (in the past, so the portal must refuse submissions) |
| Tracks | 8: Developer tools, Data and analytics, Accessibility, Security, Climate, Health, Education, Open hardware. Projects per track: 6, 6, 6, 6, 6, 5, 3, 3 |
| Judges | 30. 21 cover 1 track and **9 cover 2 tracks** (these are the bridge judges) |
| Teams | 40, with 1–4 members identified by email (13 × 1, 12 × 2, 6 × 3, 9 × 4) |
| Projects | **41**, not 40. The first three titles, which the checker looks for, are **"Glass Signal", "Small Meadow", "Deep Compass"** |
| Scores | 126, each on `functionality`, `innovation` and `quality`. Values run **2–5; no 1s**. **No weights are given.** 51 comments are empty. **Scores carry no timestamps.** |
| Reviews per project | 2 to 5 (8 × 2, 26 × 3, 3 × 4, 4 × 5). Every project has at least 2. |
| Reviews per judge | 1 to 11. **Two judges have a single score.** |
| Track matching | Every review is by a judge assigned to that track |
| Connectivity | The judge–project review graph is **one connected component**: all 30 judges, 41 projects and 8 tracks, linked through the 9 bridge judges. So a joint model can compare across tracks, although the links between tracks are thin. |
| Flat judge | **jdg_07** scored 4/4/4 on all three of their projects (SD = 0). This is the homepage's "judge who marks everything a 3". |
| Duplicate | **"Dry Harbour"**, team tm_07 "CopperLedger": **prj_07** submitted 1 Mar 04:29 and **prj_41** submitted 1 Mar 17:57 (3 minutes before close). Same title, summary and repo. prj_07 was reviewed by jdg_01, 12, 19, 21 and 26; prj_41 by jdg_18, 19, 21 and 26. **Judges 19, 21 and 26 scored both copies differently** (e.g. jdg_19 gave 2/3/2 and 5/4/2). **jdg_01's only score in the whole file is on prj_07.** |
| Incomplete batches | These appear as uneven coverage. The FAQ mentions "an incomplete batch"; the spec says "two review batches nobody finished". |

---

## 3. How we got here: decision history

*This is the narrative for the Write Up Quest. Keep appending to it during the build (see DECISIONS.md, decision 38).*

1. **We rejected reverse-engineering Raptors' past winners.** The first idea was to study their 35 past events and fit the judging algorithm to their past winners. Council review v1 (23 Sep) rejected this unanimously, for four reasons:
   - Only final rankings are public.
   - Those rankings came from the broken tools the brief wants replaced.
   - "Fitted to your history" is neither defensible nor scored.
   - It would burn the pre-kickoff window.

   The user then confirmed that raw per-judge scores from past events can't be shared. Past events are now used only for rubric presets. *Transcript: `council-transcript-20260923-1755.md`.*
2. **Duplicate policy, set by the user:** one submission per team, flag duplicates and keep the latest, and the organiser confirms. The review-merge rule for the "Dry Harbour" pair was worked out from the data: fixture scores have no timestamps, so "the later score wins" can't be computed. Instead, the kept entry's reviews win, and unique reviews move across.
3. **Stack (first choice, since replaced):** Django was first chosen over Rails, Laravel, Next.js+API, Go and FastAPI. It gives auth, admin and migrations out of the box, Python for the maths, and the spec's own example team uses it. Superseded by item 7.
4. **Prior-art research** (23 Sep) covered hackathon tools, peer-review calibration, pairwise models, assignment, judging bias and voting (see §19). It also included a full re-read of the homepage, which found **17 details missing** from the originally pasted brief. The most important were the field set, track isolation, the judge permission matrix, batched assignment, the eligibility stage, CSV at every stage and the "judge who marks everything a 3" line.
5. **Council review v2** (23 Sep) looked at 25 proposed decisions. The outcome:
   - Normalization changed from per-judge z-scores to a **joint additive ridge model**. Verified connectivity of the fixture graph showed that cross-track estimation is possible.
   - Cut: a fake Bradley-Terry "cross-check", co-movement flags, and T3 voting.
   - Four checker traps found (404 vs 403, random boot tokens, gallery hiding, closed demo event).
   - Added: a judge console, operations, an offline build, deadline edge cases, a Ranking Receipt, DECISIONS.md, and follow-up readiness.

   *Transcript: `council-transcript-v2-20260923.md`.*
6. **External plan review** (23 Sep). The user shared four build plans from other sources. Plans 1 and 2 conflicted with the brief: made-up seed data, missing roles, z-scores that divide by zero on jdg_07, and code before kickoff. They were rejected. The plan named "Tally" independently reached the same bias model and added practical safeguards, which became decisions 45–54. Tally's larger ideas (Merkle-rooted results, Schnorr-signed judge records, a `verify` CLI) sit in the stretch list after the hash-chained audit log. Its "keep the earliest duplicate" rule was not adopted, because the user chose to keep the latest.
7. **Stack changed to NestJS + Next.js** (24 Sep, user decision). The reason is team fluency: the spec says "pick what you know", and building fast in a familiar stack is worth more than Django's built-ins. What we give up, and what replaces it:
   - Django auth/sessions/CSRF → our own DB-backed sessions + an Origin check, covered by the isolation tests.
   - Django admin → organiser screens in Next.js (budgeted in H8–24).
   - numpy → a small, tested Cholesky solver in `src/judging-engine`.
   - Two containers become three (`db`, `api`, `web`), behind one public port.

   Everything that doesn't depend on the stack stays the same: the judging model, the duplicate rule, deny-first, the gates and the docs. The stack-specific traps are listed in §5.2 and §11.

**Designs we abandoned, and why:**

| Abandoned design | Why |
|---|---|
| Fitting the algorithm to past winners | The data isn't available, it can't be defended, and it scores no points |
| Per-judge z-score with three separate k=3 shrinkages | Ignores which projects each judge saw, and needs an arbitrary k |
| Bradley-Terry built from within-judge score order | Invents pairwise data from ratings and ties; it's an overclaim |
| Co-movement collusion flags | Noise with only 1–11 reviews per judge |
| Confidence-band graphics | 2–5 reviews can't support them; replaced by a posterior SD column and tie groups |
| T3 community voting | Replaced by a written threat model, to protect T1/T2 correctness |
| "Later score wins" for duplicates | Scores have no timestamps |
| A pre-kickoff notebook | Disqualification risk; moved after kickoff |

---

## 4. Final decision set

Decisions 1–44 are the council v2 verdict. Decisions 45–54 were added from the external plan review (§3, item 6). This table supersedes the living doc's decision log.

| # | Decision | Final choice | Verdict | Evidence / reason |
|---|---|---|---|---|
| 1 | Tier target | Clean, verified T1 + T2. T3 is cut; claim only T1 T2. | Changed | A tier counts only if lower tiers pass; "a clean T2 outranks a broken T4" |
| 2 | Stack | **Node 24 LTS + TypeScript.** Code under `src/` (`src/api`, `src/web`, `src/judging-engine`), suites under `tests/`, matching the spec's repo figure. API: NestJS + Prisma + PostgreSQL 16. UI: Next.js (App Router) + Tailwind, compiled at build time. Tests: Vitest + supertest. Compose services: `db`, `api`, `web`, with a single public port (web :8080 rewrites `/api/*` to `api:3001`). npm workspaces: `src/api`, `src/web`, `src/judging-engine`. | Changed (24 Sep) | Team fluency (§3 item 7); one command; offline |
| 3 | Past Raptors research | Rubric presets only, 1-hour cap, done before kickoff | Changed | Raw past scores unavailable |
| 4 | Submissions per team | One live submission per team per event (partial unique index on rows that aren't superseded) | Keep | Defensible schema |
| 5 | Existing duplicates | Detected and flagged; both stay visible until the organiser confirms; then the latest is kept | Changed | Gallery must not hide seeded titles |
| 6 | Reviews on a merged duplicate | Unique reviews move to the kept entry (recording `original_submission_id`); overlapping reviews are superseded and excluded from ranking | Keep | jdg_01's review survives; nobody is counted twice |
| 7 | Merge confirmation | The organiser confirms; audited; unmerge resets the pointers (reversible at the data level, no undo UI) | Keep | A human makes policy calls |
| 8 | Auth | Browsers use an httpOnly `session` cookie (DB-backed `Session`, token hash only, SameSite=Lax) plus an **Origin check** on cookie-authenticated writes. API clients use hashed bearer tokens. Each is justified on its own terms. | Changed | Don't look like we're gaming the checker; CSRF without Django |
| 9 | Roles | Per-event `EventRole` (participant, judge, organizer); admin = global `User.isAdmin` | Keep | Role matrix |
| 10 | Normalization | **Joint additive ridge model** (spec in §7) | Changed | Roos et al. 2011; Ge, Welling & Ghahramani; Wang & Shah 2019; Piech 2013; verified connectivity |
| 11 | Tie-break | Normalized score → raw weighted mean → review count → earliest submission; audited | Keep | Deterministic |
| 12 | Bonus focus | **Normalization Proof**. The proof script (`cli proof`) and the proof itself are written **after kickoff**. | Changed | FAQ disqualification rule |
| 13 | License | MIT | Keep | Organiser preference |
| 14 | Submission fields | Full reference field set + `CustomQuestion`/`Answer`; plain file uploads | Keep | T1 field set |
| 15 | Track isolation | **Explicit 403 before any object lookup** (a Nest guard or the first line of the service), then a Prisma query scoped by track and assignment | Changed | Check 5 needs 401/403, not 404 |
| 16 | Judge permissions | The matrix (§1.3) enforced in the service layer, including denial of aggregates and the audit log | Keep | "Denied at the API" |
| 17 | Assignment | Greedy least-loaded, track-matched, ≥ 3 reviews per project, random tie-break, conflict-of-interest block list; batches supported | Changed | Jecmen et al. 2020; PeerReview4All; homepage Fig. 04 |
| 18 | Eligibility | A status field (eligible / disqualified + reason), set by the organiser | Changed | Pipeline stage 04 |
| 19 | Bradley-Terry cross-check | **Cut.** JUDGING.md explains why pairwise mode was rejected. | Cut | No pairwise data; overclaim |
| 20 | Uncertainty | A posterior SD column; adjacent projects within one pooled SD are marked as a statistical tie | Changed | Cortes & Lawrence; Pier 2018; too few reviews for bands |
| 21 | Queue order | Random order per judge; position stored; no claim made about order effects | Keep | Bruine de Bruin 2005; fixture scores have no timestamps |
| 22 | Judge-quality flags | Low-variance flag only (catches jdg_07) | Changed | Co-movement is noise at n ≤ 11 |
| 23 | Import/export | CSV per stage + JSON in fixture shape; **the fixture importer is the seed**; `external_id` round-trips | Keep | "Leave as easily as they arrived" |
| 24 | Audit log | Append-only table + filterable organiser page | Keep | "Without a database client" |
| 25 | T3 voting | **Cut.** A written threat model takes its place. | Cut | "Pick one and nail it" |
| 26 | Open demo event | A second seeded event that closes at boot time + 7 days | New | Video must show submit; fixture event is closed |
| 27 | Judge console | One project per screen, keyboard-first, draft autosave, "Next" follows the stored queue | New | "5 hours to score 30 projects" |
| 28 | Operations | `scripts/backup.sh` / `restore.sh` (pg_dump via `docker compose exec db`), `/api/healthz`, env-var config, migrations tested on a seeded database | New | Panel values ops and reliability |
| 29 | Offline build | Images are built once (online); `up` needs no network. The Prisma CLI is a runtime dependency (never `npx` downloads); `prisma generate` runs in the Dockerfile; no `next/font/google`, no CDN, telemetry off; pinned image digests; network-off test | Changed | "Comes up on a laptop with the network off" |
| 30 | Deadline rules | Server-side UTC; accept only if `now < close`; applies to every write verb (POST, PUT, PATCH, uploads, DELETE); time comes from an injected `Clock` provider, so tests freeze it | New | "Deadline enforcement that actually holds" |
| 31 | Default weights | Equal thirds for functionality, innovation and quality; documented; editable; with a sensitivity row | New | Fixtures carry no weights |
| 32 | CSV format | UTF-8, no BOM, multi-column header row | New | Check 7 needs a comma in line 1 |
| 33 | Seed tokens | Fixed, labelled dev-only, no `#`; `cli rotate-tokens` command; rejected when `DEMO_MODE=false` | New | Must match the committed `.dogfood.toml` |
| 34 | Deny-first | Every permission check runs before the object is fetched | New | Checks 5 and 6 |
| 35 | Seed visibility | Seeded projects are eligible and publicly visible; the gallery's default order puts fixture order on page 1 | New | Check 2 |
| 36 | Results / publish | A RankingRun is frozen, the organiser publishes it, and a public results page appears | New | Lifecycle: "publish" |
| 37 | Progress dashboard | Per judge: assigned / done / not started | New | T2 |
| 38 | DECISIONS.md | Timestamped ADR log from H0, including abandoned designs | New | Write Up Quest; written defence |
| 39 | DATA-MODEL.md | Written by hand **before** models are generated | New | "LLM dumps" disqualifier |
| 40 | AI-use disclosure | A README section saying what Claude Code did and what humans designed | New | Honesty is rewarded |
| 41 | Follow-up readiness | Git tag at freeze; prepared written defences; write-up claims match the tag | New | Follow-up 29 Sep – 8 Oct |
| 42 | Cross-track statement | JUDGING.md says cross-track comparison rests on 9 bridge judges; recommends per-track prizes or reading results in tie groups | New | Verified connectivity |
| 43 | One service layer | Nest controllers are thin; every permission, deadline and audit rule lives in services. The Next.js UI calls the same `/api` endpoints as any client; it has no server-side data path of its own. | New | API First for free; one place for permissions |
| 44 | Ranking Receipt | Frozen RankingRun: inputs, parameters, raw vs normalized, rank change, a one-line reason per project, SHA-256 of canonical JSON; plus a `cli rank` command with `--diff` | New | Proof bonus in the product; "decision worth stealing" |
| 45 | Multi-architecture build | Multi-arch official base images (`node:24-bookworm-slim`, `postgres:16`), pinned by digest. No native modules needing compilation (`@node-rs/argon2` has prebuilt binaries; Next image optimisation off, so no `sharp`). If Prisma's query engine is a native binary in the pinned version, set `binaryTargets` for linux arm64 + amd64. Tested on Apple Silicon and x86. | Changed (24 Sep) | Judges likely use Apple Silicon |
| 46 | Clean-volume test | The offline test always starts with `docker compose down -v`, proving seeding works on an empty database | New (from external plan review) | "Works on my machine" with an old volume hides seed bugs |
| 47 | Readiness gate | The `db` service has a `pg_isready` healthcheck; `app` uses `depends_on: condition: service_healthy`, and the entrypoint retries the connection before migrating | Tightened (from external plan review) | No race between migrations and Postgres start-up |
| 48 | Deadline before validation | On every submission write, the deadline check runs **before** body validation and returns 403 `{"error":"submissions_closed"}` | New (from external plan review) | Check 3's 4xx must come from the deadline, not a malformed request |
| 49 | Deterministic seed mapping | judge_a = **jdg_24** (most scores: 11); judge_b = **jdg_26** (10 scores); participant = a fixture team member who isn't a judge (none overlap); plus a synthetic organizer and an admin | New (from external plan review) | Reproducible checker results; judge_a has plenty of scores to return |
| 50 | Fixture-ID routing | Routes that take a judge, project or event ID accept either the internal ID or the fixture `external_id` (e.g. `/api/judges/jdg_24/scores`) | New (from external plan review) | `.dogfood.toml` and exports line up with fixtures.json |
| 51 | Connectivity report | Each RankingRun computes the connected components of the judge–project graph and shows them to the organizer; assignment warns if a new batch would split a track's judges into disconnected groups | New (from external plan review) | Bias correction is only identifiable within a connected component; fixtures: 1 component, 9 bridge judges |
| 52 | Synthetic recovery test | A Vitest test generates known project qualities and judge biases with a seeded RNG, adds noise, fits the model, and asserts Spearman ρ > 0.9 against the truth, with the model beating raw averaging | New (from external plan review) | Evidence the method works when the answer is known; strengthens the Normalization Proof |
| 53 | Database-enforced append-only audit | A Postgres trigger, added as hand-written SQL in a Prisma migration, raises on UPDATE or DELETE of `AuditLog` rows | New (from external plan review) | "Append-only" enforced by the database, not just by convention |
| 54 | Low-evidence badge | Projects with fewer than 2 non-superseded reviews get a "low confidence" badge and are listed after ranked projects, never silently ranked | New (from external plan review) | Honest uncertainty in live events (the fixtures have ≥ 2 everywhere, so it won't trigger on seed data) |

---

## 5. Architecture and stack

### 5.1 Shape

```
Browser (Next.js pages)              API client / run.py / scripts
      │ cookie: session                     │ Authorization: Bearer
      ▼                                     ▼
 web :8080  (Next.js, the only public port)
      │  rewrites /api/*  →  http://api:3001/api/*   (same origin: no CORS, cookies just work)
      ▼
 api :3001  NestJS  ── controllers (thin; OpenAPI at /api/docs via @nestjs/swagger)
      │               ── guards: SessionGuard → RolesGuard → SubmissionsOpenGuard
      ▼
 Service layer (permissions, deadline, audit, ranking)  ──  src/judging-engine (pure TS)
      │
 Prisma Client + migrations (hand-written SQL where Prisma can't express it)
      │
 PostgreSQL 16 (named volume)
```

- **One service layer** (decision 43). Every mutation and every protected read goes through a service function. Each function does four things, in this order:
  1. checks permission (deny first);
  2. enforces the deadline where relevant;
  3. writes an audit row in the same transaction (`prisma.$transaction`);
  4. returns data.

  Controllers and Next.js pages are thin adapters over it. The UI never talks to Postgres.
- **Judging maths** lives in `src/judging-engine`: pure, deterministic functions with no Nest or Prisma imports, unit-tested on their own. The API maps database rows into it and stores the result as a RankingRun.
- **Containers:** `db` (postgres:16), `api` (NestJS on node:24-bookworm-slim) and `web` (Next.js `output: "standalone"` on node:24-bookworm-slim). All pinned by digest.
- **Boot sequence (api):** wait for the database (healthcheck plus connection retry, decision 47) → `prisma migrate deploy` → `node dist/cli.js import-fixtures data/fixtures.json` (idempotent) → create the open demo event → print the test tokens → `node dist/main.js`. **web** waits for `api` to be healthy (`/api/healthz`).
- **Config:** environment variables for session secret, `DATABASE_URL`, `DEMO_MODE`, public base URL and rate limits. Time is always UTC internally.

| Package | Use |
|---|---|
| @nestjs/core, @nestjs/swagger, @nestjs/throttler | API, OpenAPI, rate limits |
| prisma, @prisma/client | Schema, migrations, queries (**`prisma` in `dependencies`**, see §5.2) |
| class-validator, class-transformer | DTO validation (`ValidationPipe`, `whitelist` + `forbidNonWhitelisted`) |
| @node-rs/argon2 | Password hashing (prebuilt binaries for arm64 and amd64) |
| csv-stringify | CSV export |
| next, react, tailwindcss | UI |
| vitest, supertest | Tests |

The ridge solver is our own ~80-line Cholesky in `judging-engine`, with no dependency. `ml-matrix` (pure JS) is the fallback if it misbehaves. Keep the dependency list short and pinned (`package-lock.json` committed, `npm ci` in Dockerfiles).

### 5.2 Stack-specific traps (read before H0)

| Trap | What goes wrong | Rule |
|---|---|---|
| **Nest's pipeline order** | Validation fails first on the probe body, so the 4xx comes from the wrong reason | Nest runs guards **before** pipes. Enforce the deadline in `SubmissionsOpenGuard`, so it returns 403 `{"error":"submissions_closed"}` before `ValidationPipe` sees the body (decision 48). Order of checks: session → role → deadline → team membership → validation. |
| Redirects | urllib follows a 302 to a login page and gets 200 → checks 3 and 5 fail | The API never redirects. No auth redirects in Next.js middleware for `/api/*`. Unauthenticated → 401 JSON. |
| 404 instead of 403 | Scoping the Prisma query to the caller returns "not found" | `GET /api/judges/:judgeId/scores` compares `:judgeId` (internal id or `externalId`) against the **caller's own** judge ids, and checks the organizer role, **before** any query. Anything else → 403 (decision 34). |
| `npx prisma` offline | The Prisma CLI is a devDependency, so `npx` tries to download it at container start and fails with the network off | `prisma` in `dependencies`; run `node_modules/.bin/prisma migrate deploy`. Test it in the offline drill. |
| Prisma engines | A native engine for the wrong architecture, fetched at runtime | `prisma generate` in the Dockerfile. If the pinned version uses a native engine, set `binaryTargets = ["native", "linux-arm64-openssl-3.0.x", "debian-openssl-3.0.x"]`. Use Debian-slim images, not Alpine (fewer musl/OpenSSL surprises). |
| What Prisma can't express | The partial unique index (decision 4), the audit trigger (53) and CHECK constraints on score ranges are silently missing | Create the migration with `prisma migrate dev --create-only`, add the SQL by hand, and add a test that proves each constraint fires. |
| Next.js rewrite target | `next.config` rewrites are fixed at **build** time, so an env var set only at runtime is ignored | Destination is `http://api:3001` (the compose service name). If it must vary, set it as a build arg. |
| Next.js build needs the API | Static prerendering fetches data at build time and fails, or bakes in stale data | Every data page is dynamic (`export const dynamic = "force-dynamic"`) or a client component fetching `/api`. `next build` must succeed with no database. |
| Next.js network calls | `next/font/google` fetches at build; telemetry calls home; image optimisation needs `sharp` | Use a system font stack or `next/font/local`. `NEXT_TELEMETRY_DISABLED=1`. `images: { unoptimized: true }`. |
| CSRF with cookies | Django gave us CSRF for free; now nothing does | Session cookie is httpOnly + SameSite=Lax. Cookie-authenticated writes must carry an `Origin` matching the public base URL and `Content-Type: application/json`. Bearer requests are exempt: no ambient credential. Covered in the isolation tests. |
| The clock | `new Date()` scattered through services makes deadline tests flaky | One injected `Clock` provider. Tests override it, including the exact boundary instant. |
| Rate-limit storage | `@nestjs/throttler`'s default store is in memory | Fine for one API instance; say so in the threat model. Running several instances needs a shared store (future work). |
| Uploads | Files written inside the container vanish on rebuild | A named `uploads` volume, served by the API at `/api/files/:id` with the same permission checks. |

---

## 6. Data model

**Write DATA-MODEL.md by hand first** (decision 39), then write `schema.prisma` from it. This section is its draft. Prisma models use camelCase fields mapped to snake_case columns (`@map`/`@@map`), so the SQL a database reviewer reads looks conventional.

| Entity | Key fields | Constraints / notes |
|---|---|---|
| `User` | email, name, password_hash (argon2id), is_admin, created_at | Email unique (stored lower-cased); admin = `is_admin` |
| `Session` | user, token_hash, expires_at, created_at, last_seen_at | Browser sessions; only the SHA-256 of the cookie value is stored; deleted on logout |
| `EventRole` | user, event, role | Unique (user, event, role). Roles: participant, judge, organizer |
| `JudgeTrack` | event_role (judge), track | Scope for track isolation |
| `ApiToken` | user, token_hash, label, created, revoked_at | Only hashes are stored; seed tokens are fixed and labelled dev-only |
| `Event` | name, slug, opens_at, submissions_close, judging_close, results_published_at, normalization params | Close date is taken from the fixture for evt_01 |
| `Track`, `Prize` | event, name; a prize can be tied to a track | |
| `Criterion` | event, key, label, weight, min, max, order | Default weights are equal thirds |
| `Team`, `TeamMember` | event, name / team, user | A user is on at most one team per event |
| `Invite` | team, token, expires_at, max_uses, uses | Invite-link flow |
| `Submission` | event, team, track, name, tagline, description, thumbnail, repo_url, demo_video_url, live_url, tech_tags (text[]), status (draft/submitted), eligibility (eligible/disqualified + reason), submitted_at, updated_at, superseded_by, external_id, seed_order | Partial unique (event, team) where superseded_by is null: **hand-written SQL in the migration**, since Prisma can't express partial indexes. `seed_order` keeps the fixture order for the gallery (decision 35). |
| `SubmissionImage` | submission, file, order | Image gallery |
| `CustomQuestion`, `Answer` | event, prompt, required / submission, question, value | Organiser-defined questions |
| `DuplicateFlag` | kept, superseded, reason (same team / same repo / title), status (pending/confirmed/dismissed), decided_by, decided_at | |
| `Assignment` | judge (EventRole), submission, batch, queue_position, assigned_at | Unique (judge, submission) |
| `Review` | assignment, status (draft/final), comment, superseded, original_submission_id, submitted_at | |
| `CriterionScore` | review, criterion, value | Unique (review, criterion); value within [min, max], checked in the service **and** by a SQL CHECK/trigger added to the migration by hand |
| `ConflictOfInterest` | judge, team | Blocks assignment |
| `RankingRun` | event, method, params (weights, λ_b, λ_q), inputs_hash, output_hash, created_by, created_at, published_at | Frozen once published |
| `RankingRow` | run, submission, raw_mean, normalized, posterior_sd, rank, tie_group, n_reviews, reason | The receipt |
| `AuditLog` | at, actor, event, action, target_type, target_id, before, after, ip | Append-only: no update or delete path in code, **plus a Postgres trigger that raises on UPDATE or DELETE** (decision 53) |

**Import and export** (decision 23):
All commands run through one CLI entry point, built as a Nest standalone application context so it uses the same services and audit rules as the API: `docker compose exec api node dist/cli.js <command>` (or `npm run cli -- <command>` in development).
- `cli import-fixtures data/fixtures.json` reads the fixture shape and is idempotent (upsert on `external_id`). Fixture IDs become `external_id`.
- `cli export-event evt_01 > out.json` writes the same shape back out, so the round trip is lossless.
- CSV is available at every stage: registrations, teams, submissions, assignments, reviews, scores and results.

---

## 7. Judging engine

### 7.1 Scoring input

Each review gets a weighted score on the criterion scale:

```
s = Σ_c w_c · x_c  /  Σ_c w_c
```

Default weights are equal (⅓ each) because the fixtures carry none. The organiser can change them. JUDGING.md includes a sensitivity row showing how the ranking moves under one alternative weighting. Superseded reviews are excluded.

### 7.2 The model (decision 10)

This is a **joint additive model** with a bias for each judge and a quality for each project:

```
s_pj = μ + q_p + b_j + ε_pj
```

It is fitted by ridge-penalised least squares, which is the same as the MAP estimate under Gaussian priors on q and b:

```
minimise   Σ_(p,j) (s_pj − μ − q_p − b_j)²  +  λ_b Σ_j b_j²  +  λ_q Σ_p q_p²
```

- **Size:** 30 judge biases + 41 project qualities + μ = 72 unknowns. Solved in closed form in milliseconds. The normal equations `(XᵀX + Λ)θ = Xᵀs` are symmetric positive definite whenever λ_b, λ_q > 0 (μ unpenalised), so a hand-written **Cholesky** solve in `src/judging-engine` is enough (about 80 lines, tested against a small system solved by hand). Leave-one-out doesn't need 126 refits: for a linear smoother, the LOO residual is `e_i / (1 − h_ii)`, using the diagonal of the hat matrix.
- **Choosing λ** ("why k?"): select (λ_b, λ_q) by **leave-one-review-out prediction error** over the grid {0.25, 0.5, 1, 2, 4, 8}. The chosen values are stored in the RankingRun. JUDGING.md shows rankings at 0.5× and 2× the chosen values as a sensitivity check. The data picks the parameter; we don't.
- **Output:** the normalized project score is μ + q̂_p. Its posterior SD comes from the diagonal of σ̂²(XᵀX + Λ)⁻¹.
- **Why this model and not per-judge z-scores:**
  - Per-judge z-scores assume every judge saw projects of average quality. Here every review is track-matched, so a judge's mean mixes their generosity with the strength of their track.
  - The joint model estimates both at once, using who reviewed what.
  - This is the approach of Roos, Rothe & Scheuermann (AAAI 2011), and the Bayesian form NIPS used for years (Ge, Welling & Ghahramani).

**How it behaves on the fixture edge cases:**

| Case | Behaviour |
|---|---|
| **jdg_07**, flat 4/4/4 (SD = 0) | b̂ absorbs their offset. Their reviews add no discrimination and cause no distortion. There is **no division by SD**, so nothing breaks. The low-variance flag fires on the dashboard. **This is the answer to "the judge who marks everything a 3."** |
| Single-score judges | The prior pulls b̂ toward 0, so their one score is mostly taken at face value, which is the honest reading of one data point |
| Projects with 2 vs 5 reviews | λ_q shrinks the 2-review projects toward the mean more strongly, and their posterior SD is larger |
| Cross-track comparison | Identified only through the 9 bridge judges. JUDGING.md says so and recommends per-track prizes, or reading ranks in tie groups (decision 42). |
| Judge scale (stretch or compression) | **Not modelled.** 1–11 reviews per judge is too few to estimate it. Stated as a limitation. |

### 7.3 Uncertainty, ties and the receipt

- **Posterior SD column.** Adjacent projects whose difference is under one pooled SD share a **tie group** (decision 20). This follows the evidence that even expert committees disagree heavily: the NeurIPS 2014 experiment, and Pier et al. 2018.
- **Deterministic tie-break** (decision 11): normalized score → raw weighted mean → review count → earliest submission. It is recorded in the audit log.
- **Connectivity report** (decision 51). Each run lists the connected components of the judge–project graph. Scores are only comparable within a component. The fixtures form 1 component through 9 bridge judges.
- **Low-evidence badge** (decision 54). Projects with fewer than 2 non-superseded reviews are badged and listed after the ranked projects, never silently ranked.
- **Synthetic recovery test** (decision 52). A Vitest test generates known qualities and biases with a seeded RNG, adds noise, and asserts that the model recovers the true ranking (Spearman ρ > 0.9) and beats raw averaging. Its output goes in the Normalization Proof.
- **Ranking Receipt** (decision 44). Each run stores its inputs hash, parameters, raw mean, normalized score, SD, rank, rank change against raw, and a generated one-line reason per project. For example: "−0.31 adjustment: 2 of 3 reviews came from judges with positive bias." Or: "shrunk: only 2 reviews." A SHA-256 of the canonical JSON makes a published run tamper-evident.
- **CLI:** `cli rank --event evt_01 [--lambda-b X --lambda-q Y] [--weights f=1,i=1,q=1] [--raw] [--diff RUN_ID] [--explain]`.

### 7.4 The Normalization Proof (bonus), written after kickoff

It shows the following:
1. The raw table: every review.
2. The fitted judge biases b̂, with jdg_07 and the single-score judges highlighted.
3. Raw vs normalized ranking, with rank movement, like the homepage's ▲/▼ figure.
4. **Spread before and after**, echoing their σ 0.94 → 0.31 figure.
5. The λ selection curve.
6. Sensitivity to λ ×0.5 / ×2 and to alternative weights.
7. **Test–retest on Dry Harbour.** Judges 19, 21 and 26 scored the same project twice, and the differences estimate each judge's own noise (see Hodgson 2008).
8. Rejected alternatives: raw mean, per-judge z-score (breaks on jdg_07's zero SD), Borda (discards score gaps), and Bradley-Terry (no pairwise data).
9. The synthetic recovery test result (decision 52) and the connectivity report (decision 51).

The goal is that "a statistician would not wince".

### 7.5 Rejected: Pairwise Mode

Bradley-Terry (1952) and Crowd-BT (Chen et al. 2013, as used by Gavel) are the right tools **when judges make pairwise comparisons**. The fixtures contain only ratings. Deriving "wins" from each judge's rating order would invent data. So we don't claim Pairwise Mode; JUDGING.md says why and names it as the natural next mode (§17).

---

## 8. Duplicate submissions

- **Prevention:** one live submission per team per event (decision 4). Teams edit their draft instead of resubmitting.
- **Detection** at import or submit time:
  - same team, or same repo URL → **flag**;
  - same title alone → **warning**.
- **The fixture case:** Dry Harbour (prj_07 superseded, prj_41 kept) is **seeded flagged but not merged**, so the organiser confirms the merge in the demo video (decisions 5 and 7).
- **What confirming does:**
  - sets `prj_07.superseded_by = prj_41`;
  - **moves unique reviews** (jdg_01, jdg_12) to prj_41, recording `original_submission_id`;
  - marks the **overlapping reviews** (jdg_19, 21, 26 on prj_07) as superseded and excludes them from ranking;
  - writes an audit row;
  - re-runs the ranking.

  Result: Dry Harbour ends with 6 reviews (jdg_18, 19, 21, 26, 01, 12), and no judge is counted twice.
- **Unmerge** resets those pointers and flags, and is also audited.
- **Why this rule:**
  - "The later score wins" can't be computed, because there are no timestamps.
  - Dropping prj_07's reviews would delete jdg_01's only score.
  - Keeping or averaging both would count three judges twice.

---

## 9. Judge assignment and the judge console

**Assignment** (decision 17):
1. The eligible pool is eligible submissions that aren't superseded.
2. For each submission, pick candidate judges who cover its track, aren't blocked by a conflict of interest, and aren't already assigned to it.
3. Assign greedily to the **least-loaded** candidate, breaking ties at random, until every submission has **≥ 3 reviews**, the homepage's standard.
4. Work in batches: the organiser can assign by batch or run the algorithm.
5. Each judge's queue order is shuffled at random, and the position is stored (decision 21).
6. Before a batch is released, the organizer sees a warning if it would split a track's judges into disconnected groups (decision 51).

Research basis: randomised assignment makes collusion and "torpedo reviewing" harder (Jecmen et al. 2020); max-min coverage means no project is starved of reviews (Stelmakh, Shah & Singh); matching by expertise, here by track (Charlin & Zemel 2013). Deliberate overlap between judges for calibration is stretch item 6.

**Judge console** (decision 27), aimed at Devpost's "5 hours to score 30 projects":
- one project per screen, showing its fields, links and custom answers;
- the rubric with keyboard shortcuts;
- **draft autosave**, and "Next" follows the stored queue;
- a progress bar;
- **own scores only**.

The judge's own score histogram with a gentle nudge is stretch item 2.

**Progress dashboard** (decision 37): per judge, assigned / done / not started, plus per-project coverage and the low-variance flag. Updated live by polling `/api` every 10 seconds from a client component.

---

## 10. Security, role isolation and threat model

- **Deny first** (decisions 15, 16, 34). The permission check runs **before** any object lookup and returns 403. The Prisma query is then scoped to what the actor may see. That means no 404s where the checker expects 401/403, and no existence leaks.
- **Authentication:**
  - Browsers use an httpOnly, SameSite=Lax `session` cookie backed by the `Session` table. Cookie-authenticated writes also need a matching `Origin` header (our CSRF defence; §5.2).
  - API clients use `Authorization: Bearer`, with tokens stored as hashes.
  - Seed tokens are fixed, labelled dev-only, contain no `#`, can be rotated with `cli rotate-tokens`, and are refused when `DEMO_MODE=false` (decision 33).
- **Deadline** (decisions 30, 48): server-side UTC, accept only if `now < submissions_close`. It applies to create, update, upload and delete, through both the UI and the API. The check runs **before** body validation and returns 403 `{"error":"submissions_closed"}`. It is tested with a frozen clock, including the boundary instant.
- **Results** stay hidden until the organiser publishes a RankingRun.
- **Tests** call every protected route as each of: anonymous, participant, judge A, judge B, a judge from another track, and organizer. The matrix in §1.3 is the test table.

**Threat model** (lives in JUDGING.md, replacing T3; aimed at the +3 bonus):

| Threat | Status | Defence |
|---|---|---|
| A judge reads a peer's or another track's scores | Stopped | Deny-first 403 and scoped queries; tested |
| Participant scraping of scores or aggregates | Stopped | Role matrix; results unpublished until release |
| Deadline gaming (late edits, clock skew, API bypass) | Stopped | Server UTC check on every write path |
| Duplicate or resubmitted entries | Stopped | Unique constraint, DuplicateFlag, organiser confirmation |
| A flat or lazy judge | Mitigated | Model absorbs bias; low-variance flag |
| An organiser silently changes scores or rankings | Mitigated | Append-only audit log; frozen, hashed RankingRun |
| Judge collusion or bloc judging (Zitzewitz 2006) | Partly mitigated | Randomised assignment, conflict-of-interest blocks. **Not detected**: co-movement analysis is noise at this sample size. |
| Submission scraping of the public gallery | Accepted | The gallery is public by design; rate-limit the API |
| Sybil votes and ballot stuffing | Not applicable | T3 voting not built. Future design: organiser-issued one-time ballots (Douceur 2002), Wilson lower-bound ranking (Miller), hidden results |
| Token theft | Mitigated | Hashed at rest, revocable, dev tokens disabled outside demo mode |

---

## 11. Adoptability and operations

- **One command:** `docker compose up`. On boot it migrates, seeds the fixtures and the open demo event, and prints the logins and tokens.
- **Offline** (decisions 29, 45, 46): images built once with the network on (`npm ci`, `prisma generate`, `next build`, Tailwind compiled); after that `up` needs no network. Pinned multi-arch image digests. No CDN, Google fonts, telemetry or runtime `npx`. See §5.2 for the traps. **Test:** fresh clone → `docker compose build` → disconnect → `docker compose down -v` → `docker compose up` → `python3 run.py .dogfood.toml`. Run it on Apple Silicon and, if possible, on x86.
  - Open question: do they expect `build` to succeed offline too? Base images and npm packages need a download once. Ask on Discord. If yes, the fallback is a committed npm offline cache (`npm ci --offline`), which is large; decide only after the answer.
- **Operations** (decision 28):
  - `scripts/backup.sh` / `scripts/restore.sh` (pg_dump / pg_restore through `docker compose exec db`, so the api image needs no Postgres client);
  - `/api/healthz` (checks the database; used by the compose healthcheck that `web` waits on);
  - environment-variable config documented in the README;
  - migrations tested against a seeded database;
  - Postgres data in a named volume.
- **Migration in and out:** fixture-shape JSON import and export, plus CSV at every stage. A Devpost CSV importer is stretch item 5.
- **Docs a stranger can follow:** the README's quickstart runs top to bottom with no questions. A troubleshooting section covers the port in use, a stale volume and token rotation.
- **License:** MIT.

---

## 12. The acceptance checker: mapping and traps

Proposed `.dogfood.toml` (the routes are ours to choose):

```toml
[portal]
base_url = "http://localhost:8080"

[tiers]
claimed = ["T1", "T2"]
pitch = "A self-hostable hackathon portal whose rankings come with receipts: weighted rubrics, bias-corrected scores, and isolation that survives a curl."

[auth]
organizer   = "Authorization: Bearer dev-organizer-7f2a"
judge_a     = "Authorization: Bearer dev-judge-a-91bc"
judge_b     = "Authorization: Bearer dev-judge-b-44de"
participant = "Authorization: Bearer dev-participant-2e88"

[routes]
gallery      = "/api/projects"   # public JSON; the human gallery is the /projects page
submit       = "/api/events/evt_01/submissions"
judge_scores = "/api/judge/scores"
peer_scores  = "/api/judges/jdg_24/scores"   # judge_a = jdg_24 (decisions 49, 50)
csv_export   = "/api/events/evt_01/export/scores.csv"
```

| # | Check | Request | Must return | Guarantee / trap |
|---|---|---|---|---|
| 1 | Gallery is public | GET gallery, no auth | 200 | `GET /api/projects` is marked `@Public()`, so SessionGuard lets it through; no redirect anywhere on `/api/*` |
| 2 | Fixture title shown | Same body | Contains "Glass Signal", "Small Meadow" or "Deep Compass" | Page 1 ordered by `seed_order` (fixture order), page size ≥ 50; seeded projects eligible and visible (decision 35). **Trap:** random order or eligibility hiding. |
| 3 | Closed event refuses | POST submit as participant, JSON `{title, summary}` | 4xx | The deadline check runs before validation and returns 403 "submissions_closed" (decision 48). The spec says the checker "does not inspect why you refused", so any 4xx passes. We still make the deadline answer first, because a judge who curls it should see `submissions_closed`, not a validation error. In Nest, guards run before pipes, so `SubmissionsOpenGuard` answers first (§5.2). Also avoid 3xx redirects: Python's urllib follows them and lands on the wrong page. |
| 4 | Judge sees own scores | GET judge_scores as judge_a | 200 | judge_a = jdg_24, the fixture judge with the most reviews (11) |
| 5 | **Judge can't see a peer's scores** | GET peer_scores as judge_b | 401/403 | **Deny first.** **Trap:** a query scoped to the caller returns 404 (decision 34). |
| 6 | Participant blocked | GET judge_scores as participant | 401/403 | Role check before the query |
| 7 | CSV export | GET csv as organizer | 200, comma in line 1 | **Trap:** a BOM or a one-column header (decision 32) |

- **Token trap:** tokens must be **fixed** seed values that match the committed toml (decision 33).
- Only T1 and T2 are machine-verified, and a tier counts only if every lower tier passes.
- Commit `acceptance-report.txt` at **every gate** (G1–G5).

---

## 13. The plan: pre-kickoff and the 72 hours

### 13.1 Pre-kickoff, Wed 23 – Fri 25 Sep (no project code, nothing in the repo)

- [ ] **Decide solo or pair by Thursday.** Post in the Discord if looking for a partner.
- [ ] Ask on Discord:
  - Does `docker compose build` have to work offline, or only `up`?
  - How should T3/T4 claims appear, given that run.py only verifies T1 and T2?
- [ ] **On paper:** work the ridge model by hand on jdg_07's three projects plus one single-score judge. Write the three-sentence defence of choosing λ by leave-one-out.
- [ ] Draft DATA-MODEL.md prose from §6.
- [ ] Draft the ADR template, the threat-model outline from §10, and the video script from §14.
- [ ] Read Raptors' public rubrics (1 hour cap) and note criteria names for presets.
- [ ] Pre-pull `node:24-bookworm-slim` and `postgres:16`. Note the current stable versions of NestJS, Next.js and Prisma to pin at H0, and check whether that Prisma version still ships a native query engine (it decides `binaryTargets`, §5.2).
- [ ] Prepare Claude Code prompts: service-layer pattern, deny-first rule, test matrix.
- [ ] Re-read §5.2 (stack traps). Refresh Nest's request pipeline (middleware → guards → interceptors → pipes) and Prisma `--create-only` migrations if needed (docs only, not project code).

### 13.2 The 72 hours (H0 = Fri 25 Sep 18:00 UTC; freeze H72 = Mon 28 Sep 18:00 UTC)

| Hours | Build | Gate |
|---|---|---|
| **H0–8** | Walking skeleton: repo, MIT license, compose, models from DATA-MODEL.md, fixture importer as the seed, fixed tokens, Nest endpoints for the 7 checks with deny-first 403s behind the Next.js rewrite on :8080, CI running run.py. DECISIONS.md started. | **G1: 7/7 green; commit the report** |
| **H8–24** | T1 breadth: login/logout, per-event roles, organiser screens for events/tracks/prizes/criteria/custom questions (no Django admin to lean on: use one generic form component), team invite links, draft/edit with the full field set and custom questions, deadline rules on every write verb, gallery search/filter, the open demo event | **G2: checks still green; report committed** |
| **H24–36** | T2: judge invites, greedy batched assignment, weighted rubric editor, judge console, progress dashboard, CSV at every stage, audit log page. Write ARCHITECTURE.md alongside. | **G3: report committed** |
| **H36–46** | Normalization engine (ridge + λ by leave-one-out), RankingRun/Receipt, connectivity report, low-evidence badge, synthetic recovery test, `rank` CLI, results/publish page, the proof script (`cli proof`, writes the tables into `docs/proof/`), JUDGING.md with the worked table | **G4: proof reproduces; ρ > 0.9 test green; report committed** |
| **H46–56** | Dry Harbour flag/merge/unmerge; backup, restore, `/healthz`; network-off fresh-clone test starting from `down -v` on arm64 (and x86 if available); threat model. **Record a draft video at H54.** | **G5: fresh clone to green, offline, clean volume** |
| **H56–68** | README (quickstart, honest limitations, AI-use disclosure), DATA-MODEL.md final, bug fixes, final video | Docs complete |
| **H68–72** | Freeze at **H70**: final run.py, commit the report, `git tag v1.0-freeze`, submit | Submitted |

**Hard rule:** no new feature work until the current gate is green. Docs are written as we go, not saved for the end.

**Pair variant:** Partner B takes the T1 UI from H8, then docs, video and QA. Partner A keeps models, permissions and normalization. **Both must be able to defend every table in writing.**

### 13.3 Stretch order (only if ahead, in this order)

1. Hash-chained AuditLog + published RankingRun hashes (towards T4 "verifiable records"); later, a Merkle root over published scores, signed judge participation records and an offline `verify` command (ideas from the Tally plan)
2. The judge's own score histogram with a nudge
3. A what-if UI: λ slider and normalization on/off, with live rank changes
4. Webhooks for key events (submission, publish)
5. Devpost CSV importer
6. Assignment with deliberate overlap for calibration
7. (Post-hackathon) Pairwise mode with Crowd-BT, and T3 voting as designed in §10

---

## 14. Demo video script (5 minutes)

| Time | Scene |
|---|---|
| 0:00–0:20 | `docker compose up` with Wi-Fi off; the tokens print; the portal loads |
| 0:20–1:00 | **Create:** the organiser creates or opens the open demo event, adds tracks and prizes, and sets rubric weights |
| 1:00–1:40 | **Submit:** a participant forms a team by invite link and submits a draft, then edits it. Show the closed fixture event refusing (403). |
| 1:40–2:40 | **Judge:** assignment runs; the judge console with keyboard scoring and autosave; a `curl` as judge B for judge A's scores returns 403; the progress dashboard shows who hasn't started |
| 2:40–3:40 | **Integrity:** the flagged Dry Harbour duplicate is merged by the organiser; the audit log entry appears; jdg_07's low-variance flag shows |
| 3:40–4:40 | **Publish:** run the ranking and show the Receipt (raw vs normalized, rank changes, reasons, SD/tie groups); publish; the public results page |
| 4:40–5:00 | run.py output: 7/7 PASS; export CSV and JSON; close |

---

## 15. Deliverables checklist

- [ ] Public GitHub repo, MIT `LICENSE`
- [ ] `docker-compose.yml`: one command, offline, seeded
- [ ] `.dogfood.toml`: claimed `["T1","T2"]`, fixed tokens, routes
- [ ] `acceptance-report.txt`: final run.py output (committed at each gate)
- [ ] `README.md`: what it does, quickstart, test logins, env config, backup/restore, **honest limitations**, AI-use disclosure, credits and research acknowledgements
- [ ] `ARCHITECTURE.md`: diagram, service layer, deny-first, deadline, offline build, and why
- [ ] `DATA-MODEL.md`: schema (hand-written), constraints, import/export paths, the fixture mapping
- [ ] `JUDGING.md`: assignment, scoring maths, the ridge model defended, jdg_07, the λ choice, sensitivity, tie groups, the duplicate policy, the threat model, rejected alternatives, cross-track statement, citations
- [ ] `DECISIONS.md`: timestamped ADRs, including abandoned designs
- [ ] `src/`, `tests/` (Vitest + supertest): permission matrix, Origin check, deadline boundary (frozen `Clock`), hand-written SQL constraints fire, importer round trip, ranking on a fixture subset, CSV format
- [ ] 5-minute demo video (create, submit, judge, publish)
- [ ] Git tag `v1.0-freeze`
- [ ] Reachable for written follow-up, 29 Sep – 8 Oct

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Disqualification for pre-kickoff code | Paper and prose only before 18:00 UTC Fri; first commit after kickoff |
| Checker fails on a technicality (404, tokens, CSV BOM, gallery order) | §12 traps built into G1; run.py in CI |
| The offline start breaks on the judges' laptops | §5.2 traps (Prisma CLI and engines, Next.js fonts/telemetry/sharp), pinned digests, network-off test from a clean volume |
| NestJS + Next.js is more code than Django for T1 (auth, CSRF, organiser CRUD) | Generic form component for organiser screens; auth and Origin check covered by the isolation matrix from G1; cut organiser polish before cutting tests |
| Scope overrun working solo | Cuts already made (19, 20 graphics, 22, 25); gates; the stretch list is strictly ordered |
| "LLM dump" perception | Hand-written DATA-MODEL.md, ADR log, AI-use disclosure, prepared written defences |
| The normalization defence fails scrutiny | λ chosen by leave-one-out, sensitivity table, stated limitations (judge scale, thin cross-track links), citations |
| The video can't show submitting | Open demo event (decision 26) |
| Burnout | Draft video at H54; freeze at H70, not H72 |

---

## 17. Open questions

- [ ] Solo or pair? Decide by Thu 24 Sep.
- [ ] Discord: offline `build` vs offline `up`?
- [ ] Discord: how to present T3/T4 claims, given that run.py verifies only T1/T2 (we claim T1 T2 only)
- [ ] Final λ grid and the default: decided from the data after kickoff
- [ ] Is the review-merge rule (decision 6) confirmed by the user? Marked Keep by the council.

---

## 18. Write Up Quest kit

**Rules:** publish a technical write-up on any developer platform (X, LinkedIn, Dev.to, your own blog) and tag **Hackathon Raptors** (also use #DogfoodHackathon). It closes **Sun 5 Oct 18:00 UTC**; winners are announced 9 Oct; 4 × $100. It is judged "on insight, not follower count": "the schema you would redo, the normalization maths that fought you and won, the role-isolation bug you found at hour 60, the feature you cut and do not regret, the design you abandoned and why". "Small accounts, this one is winnable." It is optional and doesn't affect the main score.

**Constraint:** the judging window overlaps the write-up deadline, so **every claim must match the tagged freeze commit** (decision 41).

**Strong angles, each backed by material in this plan:**
1. **"The judge who marks everything a 4":** why z-scores divide by zero on jdg_07, and how a joint bias model (Roos et al. 2011; the NIPS calibration model) handles it. Include before/after rank movements.
2. **"We almost built a fake pairwise mode":** why Bradley-Terry built from ratings is an overclaim, and what the fixtures can and cannot support.
3. **"404 is not 403":** deny-first authorisation, and why a query scoped to the caller fails an isolation check.
4. **"The duplicate that deleted a judge":** Dry Harbour, missing timestamps, and designing a merge rule from the data.
5. **"Reverse-engineering the organisers was the wrong idea":** the pre-build council, and what we used instead (prior research).
6. **"Your ranking needs a receipt":** tie groups, posterior SD, and the NeurIPS 2014 experiment.

**Evidence to capture during the build:**
- screenshots of the Receipt;
- the λ curve;
- run.py output at each gate;
- the git log of any isolation bug fix;
- timing for 30 reviews in the judge console.

---

## 19. Research and acknowledgements

The design builds on the following work. JUDGING.md and README credit them the same way.

| Work | What it found | How we apply it |
|---|---|---|
| **Roos, Rothe & Scheuermann (2011).** [How to calibrate the scores of biased reviewers by quadratic programming](https://ojs.aaai.org/index.php/AAAI/article/view/7847). AAAI-11, 255–260. | Estimates each reviewer's bias and each submission's ideal score together, by maximum likelihood; fairer than averaging | **The core of our normalization model** (decision 10) |
| **Ge, Welling & Ghahramani.** [A Bayesian model for calibrating conference review scores](https://mlg.eng.cam.ac.uk/hong/unpublished/nips-review-model.pdf). | NIPS calibrated reviewer scores with a Bayesian bias model from 2006 to 2014 | Precedent for per-reviewer calibration in production; our ridge penalty is the MAP form of Gaussian priors |
| **Koren (2010).** [Factor in the neighbors: scalable and accurate collaborative filtering](https://dl.acm.org/doi/10.1145/1644873.1644874). ACM TKDD 4(1). | Netflix Prize-era "baseline estimates" `b_ui = µ + b_u + b_i`. User and item biases are learned by regularised least squares, with the shrinkage constants "determined by cross validation" (typical Netflix values λ₂ = 25, λ₃ = 10) | The same additive-bias-plus-shrinkage structure, with judges as users and projects as items; precedent for choosing λ by cross-validation |
| **Wang & Shah (2019).** [Your 2 is my 1, your 3 is my 9](https://arxiv.org/abs/1806.05085). AAMAS. | Shrinkage and empirical-Bayes estimators beat ranking-only methods even under arbitrary miscalibration | Keep scores rather than ranks; use shrinkage; reject Borda |
| **Piech et al. (2013).** [Tuned models of peer assessment in MOOCs](https://arxiv.org/abs/1307.2579). | Modelling grader bias and reliability significantly improved accuracy on 63,199 Coursera peer grades | Supports bias correction; reliability weighting parked as future work |
| **Pier et al. (2018).** [Low agreement among reviewers evaluating the same NIH grant applications](https://pmc.ncbi.nlm.nih.gov/articles/PMC5866547/). PNAS. | 43 reviewers, 25 applications: ICC = 0, Krippendorff's α = 0.024 | Raw scores are noisy, so we show uncertainty and tie groups (decision 20) |
| **Cortes & Lawrence (2021).** [Inconsistency in conference peer review: revisiting the 2014 NeurIPS experiment](https://arxiv.org/abs/2109.09774). | Two committees disagreed on 25% of papers; about half of accepted papers would change | Rankings need uncertainty; don't over-trust small margins |
| **Bradley & Terry (1952).** [Rank analysis of incomplete block designs](https://academic.oup.com/biomet/article-abstract/39/3-4/324/326091). Biometrika 39. | The pairwise comparison model | Considered for Pairwise Mode; rejected for lack of pairwise data (§7.5) |
| **Chen, Bennett, Collins-Thompson & Horvitz (2013).** [Pairwise ranking aggregation in a crowdsourced setting](https://dl.acm.org/doi/10.1145/2433396.2433420). WSDM. | Crowd-BT: Bradley-Terry with annotator reliability | The future pairwise mode; what Gavel uses |
| **Athalye (2015).** [Gavel](https://github.com/anishathalye/gavel); [Designing a better judging system](https://www.anishathalye.com/2015/03/07/designing-a-better-judging-system/); [Implementing a scalable judging system](https://www.anishathalye.com/2015/11/09/implementing-a-scalable-judging-system/). | Pairwise judging at HackMIT: 1,351 votes, 108 judges, 195 projects; "people are much better at comparative judgements" | Credited as prior art; informs the future pairwise mode |
| **HackUTD.** [Jury](https://github.com/hackutd/jury). | Per-judge ranking with Borda aggregation | Prior art; rejected Borda because it discards score gaps |
| **Herbrich, Minka & Graepel (2006).** [TrueSkill](https://papers.nips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system). NIPS. | Bayesian Elo with uncertainty | Considered; more than we need |
| **Charlin & Zemel (2013).** [The Toronto Paper Matching System](https://www.semanticscholar.org/paper/The-Toronto-Paper-Matching-System:-An-automated-Charlin-Zemel/d5fa5bd2ae89296acbfd9766f50c909f2c42effe). | Expertise-based reviewer assignment | Track matching in assignment |
| **Stelmakh, Shah & Singh.** [PeerReview4All](https://arxiv.org/abs/1806.06237). | Max-min fair assignment | The coverage floor of ≥ 3 reviews |
| **Jecmen et al. (2020).** [Mitigating manipulation in peer review via randomized reviewer assignments](https://arxiv.org/abs/2006.16437). NeurIPS. | Randomisation limits collusion and torpedo reviewing | Random tie-break and shuffled queues |
| **Bruine de Bruin (2005).** [Save the last dance for me](https://pubmed.ncbi.nlm.nih.gov/15698823/). Acta Psychologica. | Later-performing contestants score higher (Eurovision, figure skating) | A random queue per judge (decision 21); no claim made, since there are no timestamps |
| **Wang et al. (2022).** [Modeling and correcting bias in sequential evaluation](https://arxiv.org/abs/2205.01607). | Correction for order effects | Queue positions stored so this becomes possible later |
| **Zitzewitz (2006).** [Nationalism in winter sports judging](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1530-9134.2006.00092.x). JEMS. | Own-nation bias, bloc judging and vote trading among Olympic judges | Conflict-of-interest blocks; the collusion limitation named in the threat model |
| **Hodgson (2008).** [An examination of judge reliability at a major U.S. wine competition](https://wine-economics.org/wp-content/uploads/2012/10/Vol.3-No.2-2008-An-Examination-of-Judge-Reliability-at-a-Major-U.S.-Wine-Competition.pdf). JWE 3(2). | Only about 10% of expert judges reproduced their score for the same wine | Dry Harbour test–retest in the Proof |
| **Douceur (2002).** [The Sybil attack](https://www.microsoft.com/en-us/research/publication/the-sybil-attack/). IPTPS. | Without a central identity authority, Sybil attacks can't be prevented | Future T3 design: organiser-issued ballots |
| **Miller.** [How not to sort by average rating](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html). | The Wilson lower bound beats raw averages for small samples | Future community-vote ranking |
| **Devpost** ([judging & voting](https://help.devpost.com/article/64-judging-public-voting)), **Devfolio** ([features](https://devfolio.co/blog/devfolios-stack-of-features/), [judging](https://guide.devfolio.co/docs/guide/judging)), **DoraHacks** ([quadratic voting](https://dorahacks.io/blog/guides/what-is-quadratic-voting-funding-how-did-we-improve-it/)), **Gitcoin** ([Sybil resistance](https://gitcoin.co/research/quadratic-funding-sybil-resistance)) | Incumbent gaps: no weights, undocumented normalization, voting fraud guidance, identity-based quadratic voting | The problem statement; what we do differently |
| **JunctionApp, Dribdat, Hibiscus, Quill** (via [awesome-hackathon](https://github.com/dribdat/awesome-hackathon)) | Existing self-hostable platforms | Prior art; we write new code and don't rebrand any of them |

**Process acknowledgement:** the design was pressure-tested in two LLM-council reviews (Karpathy-style: five advisors, anonymous peer review, a chairman). Transcripts are in this folder. Claude Code (Anthropic) assisted with research, planning and, during the build, implementation, as disclosed per decision 40.

---

## 20. Sources

**Hackathon:** [homepage](https://dogfoodhack.com/) · [spec](https://dogfoodhack.com/spec/) · [spec.md](https://dogfoodhack.com/spec/spec.md) · [run.py](https://dogfoodhack.com/spec/run.py) · [fixtures.json](https://dogfoodhack.com/spec/fixtures.json) · [example.dogfood.toml](https://dogfoodhack.com/spec/example.dogfood.toml) · [Discord](https://discord.gg/xfYPDZYqeh) · [raptors.dev](https://raptors.dev)

**Research and tools:** all links in §19.

**Companion files in this workspace:**
- `planning/council-transcript-20260923-1755.md` (council v1)
- `planning/council-transcript-v2-20260923.md` (council v2)
- `spec/`: the organisers' reference copies of spec.md, run.py, fixtures.json and example.dogfood.toml, fetched 23 Sep
- The living doc: [DOGFOOD 2026: Build Plan & Design Decisions](https://claude.ai/code/artifact/f604f297-291f-4d72-ab98-4017ef56a12b), including the *Prior art research* tab
