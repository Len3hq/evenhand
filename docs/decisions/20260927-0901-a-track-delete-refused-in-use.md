# Deleting a track that is in use is refused

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

The schema's foreign keys decide what happens to a deleted track's dependants: submissions and prizes are `ON DELETE SET NULL`, a judge's track permissions (`judge_tracks`) are `ON DELETE CASCADE`. Letting a delete go through would therefore, silently and in one click:

- move that track's projects out of every track (they would be judged and ranked without one);
- turn its track prizes into overall prizes;
- remove what the track's judges are allowed to see.

Each of those changes the outcome of judging without anyone having decided it.

## Decision

`DELETE /events/:ref/tracks/:trackRef` counts the track's submissions, prizes and judges in the same transaction and refuses with **409 `track_in_use`**, naming what is still in it ("`Developer tools` still has 6 submissions, 3 judges"). Only an empty track is deleted, with a `track.deleted` audit row holding the full row.

## Consequences (including what we gave up)

- Removing a used track takes more steps: move its projects, prizes and judges first. There is no "move everything to track X" operation yet.
- The foreign keys stay as they are: the API is the only writer, and the rule is enforced there and tested (`tracks-prizes.e2e-spec.ts`, and a matrix row proving non-organisers are refused before the check runs).
- Renaming a track is always allowed; it changes a label, not who is judged where.
