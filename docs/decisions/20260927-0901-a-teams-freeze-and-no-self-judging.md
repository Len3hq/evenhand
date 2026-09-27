# Teams freeze with the submission window; judges and organisers cannot compete

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

T1 asks for "team formation by invite link" and "deadline enforcement that actually holds". Two questions the spec leaves open:

1. When may team membership change? If people can join a team after the deadline, a finished project can gain members who did none of the work, and the deadline no longer "holds" for who gets credit.
2. May someone judge or organise an event and also compete in it? Roles are per event, so the data model allows it. Judging your own team is the plainest conflict of interest there is, and an organiser can see every score.

## Decision

- Creating a team, creating an invite and joining by invite all go through the same deadline rule as submissions: accepted only while `opens_at <= now < submissions_close` (server clock, UTC). Outside it: 403 `submissions_not_open` / `submissions_closed`.
- A user with the `JUDGE` or `ORGANIZER` role in an event is refused (403) when creating or joining a team in that event.
- Invite links: 256-bit random token, returned once and stored as SHA-256; 7 days; 4 uses; the last place is claimed with a conditional update, so a race admits exactly one person. Expired or used-up links answer 410, unknown ones 404.

## Consequences (including what we gave up)

- A team that forgot to add someone before the deadline cannot fix it themselves; an organiser would need a tool for that, which is not built.
- The conflict rule is checked when joining. Someone who joins a team and is _later_ made a judge of the same event is not caught here; judge assignment (B) must exclude a judge's own team through the conflict-of-interest table.
- No per-event team-size cap (the schema has no setting); each link admits at most 4, but a team can create more links. Listed in the README's limitations.
