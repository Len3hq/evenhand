# Events are exported in the organisers' fixtures.json shape

- Status: accepted
- Date: 2026-09-27 · Owner: A (the scores part is read from B's tables; B to review)

## Context

Adoptability asks for "a migration path in and out". We already had a way in (the importer that loads `fixtures.json` on every boot) and no way out. The obvious design is a dump of our own schema, which only another Evenhand could read.

## Decision

- The export **is** the fixtures.json shape: `event`, `tracks`, `judges`, `teams`, `projects`, `scores`, with fixture ids where a row has one. Every DOGFOOD portal was built to read that shape, so an event can leave Evenhand for any of them, and their exports can come in.
- What the shape cannot hold travels under one optional `evenhand` key (slug, opening and judging dates, prizes, rubric labels, weights and ranges, project taglines, descriptions, links, tags). Importers that do not know it ignore it; ours applies it to the rows it creates, after validating it as strictly as the rest of the file.
- Only submitted projects and final reviews leave. Drafts are private by design; unfinished reviews are not scores.
- The shape requires a track per project, so trackless projects go into a placeholder track `evenhand-no-track`, keeping the file valid everywhere.
- Deterministic output: every list is sorted by its exported id (projects by original order), so the same event always gives the same bytes. Tested: exporting `evt_01` reproduces the published file record for record, and export → import into an empty database → export is byte-identical.
- Import is a command (`cli import`), not a web upload, and creates accounts without passwords; `cli reset-password` hands out one per person, printed once and audited.

## Consequences (including what we gave up)

- Not a full backup: sessions, tokens, audit history, invites, drafts and duplicate decisions are not in the file. The database backup (README) is the full copy; this is the portable one.
- Criteria, weights and prizes are only restored from an Evenhand export; a plain fixtures.json gets the default rubric (the union of score keys, equal weights).
- Judge and participant emails are in the file, as in the shared shape. The export is for organisers only and is sent as a download.
