# Drafts, submitting, and editing until the deadline

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

T1 asks for "project submission with draft and edit until the deadline" and "deadline enforcement that actually holds". Open questions: what "submitted" means if editing continues, what a draft needs before it can be submitted, and who may read a draft.

## Decision

- A submission starts as `DRAFT`. Any member of the team can edit it (`PATCH /submissions/:ref`) and submit it (`POST /submissions/:ref/submit`). Every write, create, edit and submit, goes through the same rule: `opens_at <= now < submissions_close`, server clock, UTC. After the close the last saved version is what is judged.
- **Submitting does not lock the entry.** It stays editable until the deadline and stays `SUBMITTED`; the spec says "edit until the deadline", and a team that finds a typo at 17:55 should be able to fix it. `submitted_at` records the first submission; a second submit is a no-op with no audit row.
- To submit, a draft needs a **title and a summary**, the two fields a gallery card shows. Anything else is optional; the schema has no per-event required-field setting.
- **Only `SUBMITTED` entries are public** (the gallery already filters on it). A draft is visible to its team, the event's organisers and admins; anyone else gets the same 403 for a real and a made-up id.
- Organisers can read but not edit a team's submission: the content is the team's.
- A copy held as a suspected duplicate, or replaced by a newer one, cannot be edited (409 `submission_superseded`), so edits land on the copy that is judged.
- Every edit writes a `submission.updated` audit row with only the changed fields, before and after; an edit that changes nothing writes nothing.

## Consequences (including what we gave up)

- There is no "withdraw" (back to draft). A team that wants out asks an organiser; disqualification is an organiser tool not built yet.
- Judges could in principle see an entry change until the deadline; judging starts after it, so in practice they see the final version.
- Image uploads and organiser-defined questions (both in the schema) are not part of this API yet; they are listed in the README's status table.

Update 2026-09-28: disqualification is built ([ADR](20260928-0812-a-duplicate-decisions-and-disqualification.md)).
