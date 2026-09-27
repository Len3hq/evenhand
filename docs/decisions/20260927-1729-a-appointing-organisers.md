# Appointing organisers

- Status: accepted
- Date: 2026-09-27 · Owner: A (supersedes the "not in the API yet" note in 20260927-0811)

## Context

Events are created by admins and existing organisers, and the creator becomes the only organiser. A real event is run by several people, and until now only a platform admin could stand in for a missing one.

## Decision

- `GET/POST/DELETE /events/:event/organizers`, for that event's organisers and admins, and an "Organisers" section on the event's settings page.
- **By existing account only.** The portal sends no email, so an organiser is added by the email of an account that already exists (404 with "ask them to register first" otherwise).
- **Conflict of interest, both ways.** Organisers see every score, so someone on a team in the event, or judging it, cannot be made its organiser (409 `conflict_of_interest`); the team rules already stop an organiser from joining a team in their own event.
- **Never without an organiser.** Removing the last one is refused (409 `last_organizer`). Anyone can step down while another organiser stays.
- Both actions are audited and read as sentences in the trail ("Demo Organizer made "ben@…" an organiser").

## Consequences (including what we gave up)

- No pending invitations: the person must register before being added. An invite-link flow like the team one would remove that step; not needed yet.
- Admins are not listed as organisers; they can manage every event without a role in it.
