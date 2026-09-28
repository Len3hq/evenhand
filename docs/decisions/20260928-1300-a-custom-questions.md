# Organiser-defined questions: private by default, and answers are never lost

- Status: accepted
- Date: 2026-09-28 · Owner: A

## Context

T1's reference field set ends with "organiser-defined custom questions". Organisers ask two kinds of thing: some that belong on the project page ("What did you build during the event?") and some that do not ("A phone number for the finals", "What did you reuse from an earlier project?"). Teams answer while drafting, and organisers keep editing the form after teams have started. Deleting or re-publishing what a team has already written would break trust in the portal, which is the point of this build.

## Decision

- **One list per event, replaced as a whole** (`PUT /events/:event/questions`), like the rubric. Rows with an `id` keep their question and its answers; rows without one are new. At most 20 questions of up to 300 characters; answers up to 5,000.
- **Private by default.** A question's answers are seen by the team, the event's organisers and its judges. Only a question marked public shows its answers in the gallery. The gallery query filters on `is_public`, so a private answer never leaves the API for a visitor.
- **Required means required at submission, not while drafting.** A draft can be saved with required questions empty; submitting names what is missing. A submitted entry cannot be edited back into an incomplete state. The same now holds for the summary, which submitting already required but a later edit could clear.
- **What cannot change once teams have written** (409 `questions_locked`, rules in `question-rules.ts`, unit-tested):
  - an answered question cannot be removed, because that would delete teams' work;
  - an answered private question cannot become public, because those answers were given in private;
  - a question cannot become required, or be added as required, while a submitted entry has no answer to it, because that entry would break the rule it was accepted under.
- **What can change:** rewording a prompt, reordering, making a question optional or private, and adding optional questions. The audit trail records the old wording in a readable sentence.
- **Concurrency.** Changing questions takes an update lock on the event row, and saving answers takes a share lock, so an answer cannot land on a question that is being deleted. The database also checks that an answer's question and submission belong to the same event (trigger), and that prompts and answers are not blank.
- **Ways out.** The submissions CSV gets one `answer: <prompt>` column per question. The event export carries questions and answers in the `evenhand` block; questions keep their ids through `external_id`, so export → import → export stays byte-identical. As with prizes, questions are imported only with a new event.

## Consequences (including what we gave up)

- Answers are plain text. There are no typed questions (choice lists, numbers, URLs); a team's answer is shown as written.
- An organiser can reword an answered question in ways that change its meaning. We allow it, because blocking typo fixes would be worse, and every change is in the audit trail.
- Judges see private answers. That is what organisers ask them for, and it is stated next to every answer field the team fills in. There is no "organisers only" level.
- Answers written into a draft stay private with the draft: the event export carries submitted projects only.
