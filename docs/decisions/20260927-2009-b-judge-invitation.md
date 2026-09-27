# Judge invitation by link, per track

- Status: accepted
- Date: 2026-09-27 · Owner: B (built by the team's A under the whole-app plan)

## Context

T2 starts with "judge invitation and assignment". Judges came only from fixtures.json; a real event needs organisers to add judges. The portal sends no email (offline rule), and team invites already use hashed, expiring links.

## Decision

- A new table, `judge_invites` (additive migration `20260927194102_judge_invites`): event, tracks, token hash, expiry, uses. CHECK constraints keep `1 <= max_uses <= 50` and `uses <= max_uses`, so a race can never admit an extra judge.
- Organisers create a link on the settings page, choosing tracks (required when the event has tracks); one use by default, up to 50 for a panel link; 7 days by default, up to 30. The token is shown once and never logged.
- Anyone logged in can accept, unless they are on a team in the event or organise it (409 `conflict_of_interest`), already judge it (409), or judging has closed (403 `judging_closed`). A refusal does not use the link up.
- Organisers see every judge with tracks and progress (assigned / finished), change a judge's tracks, and remove a judge who has not reviewed anything. A judge with reviews cannot be removed (409 `judge_has_reviews`): their scores are part of the record.
- Every step is audited as a sentence ("Demo Organizer created a judge invite link (1 use) for Games", "… joined as a judge for Games").

## Consequences (including what we gave up)

- A judge who should stop reviewing mid-event cannot be removed once they have reviews; assignment (next) will be able to stop giving them work.
- Invite links cannot be revoked individually yet; they expire (at most 30 days) or get used up.
- Judges were counted in the seed test as "every judge role"; it now counts fixture judges (those with a fixture id), like it already did for events and submissions.
