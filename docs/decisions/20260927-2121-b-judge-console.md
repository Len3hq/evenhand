# The judge console: drafts, final reviews, and what is audited

- Status: accepted
- Date: 2026-09-27 · Owner: B (built by the team's A under the whole-app plan)

## Context

Assignment gives each judge a queue. Judges need to score one project at a time without losing work, and organisers need scores they can trust: a judge must not see or touch anyone else's review, and a review that counts must not change afterwards.

## Decision

- Routes under `/api/judge` (judges only): the queue, one review, save a draft, submit. Every lookup is "this assignment, where the judge is the caller": anyone else, including the event's organisers, gets the same 403 whether or not the assignment exists. Organisers read scores through exports and the dashboard, never through a judge's console.
- **Drafts** may be partial and are checked mark by mark against the rubric (known criterion, whole number, inside its range); `null` clears a mark. The page saves a draft 0.7 s after each change, and before moving to another project.
- **Submitting** needs every criterion marked and makes the review **final**: later saves are refused (409 `review_final`), submitting again changes nothing. There is no reopen yet.
- Writes stop when judging closes (`judging_close`), shown on the queue and the review page.
- **Audit, deliberately not per keystroke.** CONTRIBUTING asks every mutation to write an audit row. Autosave would write one every few seconds per judge and bury the trail an organiser is meant to read. So the trail records when a judge **starts** a review and when they **submit** it, with the final marks and comment; intermediate drafts are private working state and are not scores. The review row keeps its latest draft and `updated_at`.

## Consequences (including what we gave up)

- A mistaken final review cannot be corrected by the judge; an organiser tool to reopen one (audited) is future work.
- The audit trail cannot replay a judge's thinking, only what they started and what they submitted.
