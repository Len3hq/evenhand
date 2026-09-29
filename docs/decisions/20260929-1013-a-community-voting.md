# Community voting: three ways in, a few votes each, results hidden until published

- Status: accepted
- Date: 2026-09-29 · Owner: A

## Context

T3 asks for "community voting with configurable access: an open link, email-gated, or authenticated", results "hidden from everyone except organizers while voting is open", "randomised project order on ballots, to kill position bias", and "anti-abuse that means something: rate limits, duplicate detection, and an audit trail an organizer can read". It also invites "something better than one-person-one-vote, if you can defend it". The market's own advice is that a public vote is easy to game, so results should stay hidden until someone has looked at the votes.

## Decision

- **One vote per event**, kept apart from judging: it never changes the judged ranking. The organisers set a window (UTC, server clock), an access mode and a number of votes per voter (1 to 10).
- **Three access modes:**
  - `ACCOUNTS`: anyone logged in votes at `/events/:event/vote`. Nobody can vote for a project of their own team.
  - `EMAIL_LIST`: the organisers paste emails and get one personal link each, shown once (only its SHA-256 is stored). One link per email per vote, enforced by the database.
  - `OPEN_LINK`: one shared link, shown once and replaceable. Each visitor who clicks "Get my ballot" receives a personal link of their own, only while voting is open.
- **Several votes, at most one per project (approval voting with a cap).** A voter backs up to N different projects. This is better than one person, one vote, because a voter is not pushed to abandon a favourite for a front-runner, and several good projects can each get support. It is simple enough to explain on the ballot. We did not build quadratic voting: its cost curve needs a budget that people understand, and it is only as strong as the one-person check behind it, which an open link cannot give.
- **Ballot order:** each ballot lists the public projects in its own order. It is a shuffle by the engine's seeded RNG, from a seed taken from the ballot's id, so the same voter always sees the same order and no project gains from being first.
- **Hidden results:** the tally is for organisers only. Publishing is possible only after the window has closed (409 before), and a published vote is final: its settings can no longer change, so the window cannot be reopened. The public page shows the counts and the number of voters, never who voted for what.
- **Rules fixed once voting starts:** after the first vote, the mode and the number of votes per voter cannot change (409). The dates can move until publication.
- **Anti-abuse:**
  - _Rate limits:_ a vote limit of its own (`RATE_LIMIT_VOTE_PER_MIN`, 60 a minute per address), which also covers taking ballots from the shared link. Refusals get 429 and are audited.
  - _Duplicates:_ the database allows one ballot per account and per personal link, one link per email, and one vote per project per ballot; the ballot row is locked while a vote is counted, so two quick clicks cannot exceed the limit. For the shared link, the address that took each ballot is stored. Organisers see how many addresses took more than one ballot, and those ballots' votes counted apart in the tally, before they decide to publish. The addresses themselves are never shown.
  - _Audit:_ every setting change, batch of links, new shared link, ballot taken, vote, withdrawal and publication is a sentence in the event trail. Account voters are named; link voters are "A voter". Emails and secrets never enter the trail.

## Consequences (including what we gave up)

- The shared link cannot tell one person from another: someone who changes network can take more ballots. The repeat-address signal and the audit trail make this visible; they do not stop it. That is why the other two modes exist.
- An email-list link can be forwarded. Its holder votes once, as that email.
- Organisers cannot delete individual votes. A suspicious vote is a reason not to publish, or to note it; nothing is removed silently.
- Voting is not part of the event export, since the fixtures.json shape has no field for it.
