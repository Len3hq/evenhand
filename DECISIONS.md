# Decisions

Every design decision worth defending has its own record in [`docs/decisions/`](docs/decisions/), written when it was made: the context, the decision, and what we gave up. This page is the index, grouped by topic. File names start with the UTC time of the decision and the area that owned it (a: platform and security, b: judging). A later decision that changes an earlier one has its own record, and the earlier one gains a dated line pointing to it.

## Foundations

- [Stack: NestJS + Next.js + Prisma + PostgreSQL](docs/decisions/20260926-1300-a-stack-nestjs-nextjs.md): replaces the plan's Django choice with the team's strongest stack.
- [Repo layout and Vitest](docs/decisions/20260926-1305-a-repo-layout-and-tests.md)
- [db and api on an internal Docker network](docs/decisions/20260926-1320-a-internal-network.md): "no external API at runtime" by construction, not by convention.
- [Prisma 7 specifics and hand-written SQL constraints](docs/decisions/20260926-1325-a-prisma7-hand-written-sql.md): what Prisma cannot express lives in the migrations, and a test proves each rule fires.
- [Dependency versions and accepted advisories](docs/decisions/20260926-1330-a-dependency-pins.md)

## Accounts and security

- [Bearer tokens and cookie sessions](docs/decisions/20260926-1310-a-auth-tokens-and-sessions.md): only hashes are stored; demo tokens work only in demo mode.
- [Who can create an event](docs/decisions/20260927-0811-a-who-creates-events.md): admins, and people who already organise one.
- [Appointing organisers](docs/decisions/20260927-1729-a-appointing-organisers.md): never the last one, never someone competing in or judging the event.
- [Rate limits that match the threat model, and a nonce-based CSP](docs/decisions/20260927-2310-a-rate-limits-and-csp.md)
- [API tokens from the shell, and the offline drill](docs/decisions/20260927-2329-a-api-tokens-and-offline-drill.md): tokens are issued and revoked where the first admin is created; the drill proves the portal runs with the network cut.

## Events, teams and submissions

- [Teams freeze with the submission window; judges and organisers cannot compete](docs/decisions/20260927-0901-a-teams-freeze-and-no-self-judging.md)
- [Deleting a track that is in use is refused](docs/decisions/20260927-0901-a-track-delete-refused-in-use.md)
- [Drafts, submitting, and editing until the deadline](docs/decisions/20260927-1441-a-drafts-edit-until-deadline.md): the deadline holds on every write, not just the first.
- [Organiser pages](docs/decisions/20260927-1535-a-organiser-pages.md)
- [Organiser-defined questions](docs/decisions/20260928-1300-a-custom-questions.md): private by default, and answers teams have written are never lost.
- [Image uploads](docs/decisions/20260928-1500-a-image-uploads.md): every upload re-encoded by the portal, and exactly as visible as its project.
- [Comments on gallery projects](docs/decisions/20260929-0937-a-comments.md): moderated by the event's organisers, reversibly, with every step audited.

## Judging

- [Editing the rubric once judging starts](docs/decisions/20260927-1929-b-rubric-editing-rules.md): weights and labels may change; structure may not.
- [Judge invitation by link, per track](docs/decisions/20260927-2009-b-judge-invitation.md)
- [Assignment: greedy, least-loaded, track-matched, seeded](docs/decisions/20260927-2057-b-assignment.md)
- [The judge console](docs/decisions/20260927-2121-b-judge-console.md): drafts, final reviews, and what is audited.
- [The progress dashboard, and what counts as a "flat" judge](docs/decisions/20260927-2144-b-progress-and-flat-judges.md): identical marks, not identical averages.
- [Normalization: a joint ridge model, λ by leave-one-out, and honesty about signal](docs/decisions/20260927-2207-b-normalization.md)

## Results and integrity

- [Ranking runs, receipts and publishing](docs/decisions/20260927-2235-b-ranking-runs-and-publishing.md): hashes of inputs and result; a run the data has moved on from cannot be published.
- [Imported duplicates and the one-live-submission rule](docs/decisions/20260926-1315-a-duplicate-hold.md)
- [Duplicate decisions and disqualification](docs/decisions/20260928-0812-a-duplicate-decisions-and-disqualification.md): a merge rule worked out from the data, undoable row for row.
- [A readable audit trail](docs/decisions/20260927-1454-a-readable-audit-trail.md): one sentence per entry, for organisers who have never seen the schema.
- [Events are exported in the organisers' fixtures.json shape](docs/decisions/20260927-1513-a-export-in-the-shared-shape.md): so any portal from this event can read our export.

## Designs we rejected

Each is explained where the decision was made.

| Rejected                                               | Why                                                                                                           | Where                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Django (the plan's first choice)                       | The team is strongest in TypeScript; Nest's guards suit layered authorisation                                 | [Stack](docs/decisions/20260926-1300-a-stack-nestjs-nextjs.md)                                    |
| Per-judge z-scores for normalization                   | They assume every judge saw average projects, and divide by a flat judge's zero spread (jdg_07)               | [Normalization](docs/decisions/20260927-2207-b-normalization.md), [JUDGING.md §4](JUDGING.md)     |
| A pairwise (Bradley–Terry) mode built from ratings     | The fixtures hold ratings, not comparisons: "wins" derived from ratings would be invented data                | [JUDGING.md §4, Limits](JUDGING.md)                                                               |
| "The later score wins" when merging a duplicate        | The fixture scores have no timestamps, and dropping the older copy's reviews would delete jdg_01's only score | [Duplicate decisions](docs/decisions/20260928-0812-a-duplicate-decisions-and-disqualification.md) |
| Rotating the demo tokens                               | New values would have to match the committed `.dogfood.toml`, so rotation changes nothing; revoking them does | [API tokens](docs/decisions/20260927-2329-a-api-tokens-and-offline-drill.md)                      |
| Storing uploaded images as received                    | Hidden scripts, GPS data and decompression bombs would all survive; re-encoding keeps only the pixels         | [Image uploads](docs/decisions/20260928-1500-a-image-uploads.md)                                  |
| Flagging a judge whose reviews merely average the same | jdg_19's 3/5/3, 3/4/4 and 5/4/2 all average 3.67, yet that judge clearly told the projects apart              | [Progress](docs/decisions/20260927-2144-b-progress-and-flat-judges.md)                            |

## Writing a new record

Use `docs/decisions/<yyyymmdd-hhmm>-<a|b|c>-<slug>.md` with the template in [CONTRIBUTING.md](CONTRIBUTING.md#decision-records), and add a line here.
