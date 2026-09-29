# Demo video script (5 minutes)

The rules ask for one full event lifecycle: **create, submit, judge, publish**. This script follows the current UI. Record at 1280×800 or larger, browser zoom 110%, and link the video near the top of the README when it is uploaded.

## Before recording

```sh
docker compose down -v && docker compose up -d --build --wait   # fresh, seeded stack on the current code
```

Every account's password is `evenhand-demo`. Use three browser profiles (or one normal window and two private ones) so the organiser, participant and judge stay logged in side by side:

| Profile     | Account                                                      |
| ----------- | ------------------------------------------------------------ |
| Organiser   | `organizer@evenhand.local`                                   |
| Participant | `priya1@example.org` (on "Demo Team" in the open demo event) |
| Judge       | registers during the video from the judge invite link        |

Open a terminal as well (for the curl and the tamper check).

## The script

| Time      | Show                                                                                                                                                                                                                                                                                                                                                 | Say (roughly)                                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Terminal: `docker compose up` output ending in the printed test logins. Then the gallery at `localhost:8080/projects`.                                                                                                                                                                                                                               | "One command, no internet: the portal starts seeded with the organisers' 40 fixture projects."                  |
| 0:20–1:00 | **Create.** Organiser → `/organizer/events/new`: create "Demo Night", deadline tomorrow. On its page: add tracks "Games" and "Tools", set the rubric (Impact weight 2, Polish weight 1), add one custom question. Copy a **judge invite link** for Games.                                                                                            | "Organisers set dates, tracks, prizes, a weighted rubric and their own questions."                              |
| 1:00–1:45 | **Submit.** Participant → `/teams`: create a team in Demo Night, then the submission form: title, summary, track Games, answer the question, **upload a screenshot**, submit. Show it appearing in the gallery.                                                                                                                                      | "Teams draft and edit until the deadline; images are re-encoded by the portal, metadata stripped."              |
| 1:45–2:40 | **Judge.** Judge profile opens the invite link, registers, joins as a Games judge. Organiser runs **assignment** (point at the note that submissions are still open). Judge → `/judging`: score with the keyboard, autosave, submit. Terminal: `curl -H 'Authorization: Bearer dev-judge-b-44de' localhost:8080/api/judges/jdg_24/scores` → **403**. | "Judges see only their own assignments, in their own tracks. The API refuses everything else, not just the UI." |
| 2:40–3:20 | **Integrity, on the fixture event.** Organiser → `Sample Hack 2026` → progress (flat judge jdg_07 flagged) → entries: **confirm the Dry Harbour duplicate** (5 reviews: 2 move across, 3 set aside).                                                                                                                                                 | "The planted duplicate: nobody's review is lost, nobody counts twice."                                          |
| 3:20–4:15 | **Publish.** Results page: run the ranking. Show the receipt: raw vs normalized, ▲▼ moves, the reason per project, tie groups, the hashes. Publish, then open the public results page.                                                                                                                                                               | "Harsh and generous judges are corrected jointly; every number comes with a reason and a hash you can check."   |
| 4:15–4:45 | **Tamper check.** Audit page shows _Tamper check passed_. Terminal: switch the triggers off and edit one entry, run `cli verify-audit` → **BROKEN**, reload the audit page → red. (Commands below.)                                                                                                                                                  | "Even with database access, changing history shows."                                                            |
| 4:45–5:00 | Terminal: `npm run acceptance` → 7/7 PASS.                                                                                                                                                                                                                                                                                                           | "Clean T1 and T2, verified by the organisers' own checker."                                                     |

### Tamper commands (4:15)

```sh
docker compose exec -T db psql -U evenhand -d evenhand -c "
  ALTER TABLE audit_log DISABLE TRIGGER USER;
  UPDATE audit_log SET after = '{\"edited\": true}' WHERE id = (SELECT min(id) + 5 FROM audit_log);
  ALTER TABLE audit_log ENABLE TRIGGER USER;"
docker compose exec api node dist/cli/cli.js verify-audit
```

Reset afterwards with `docker compose down -v && docker compose up -d`.

## Tips

- Rehearse once end to end; the whole flow takes under 5 minutes when nothing is typed live except scores.
- Keep the terminal font large (18 pt or more) so curl output is readable.
- If a step fails on camera, cut it rather than retake everything; the video is judged on the lifecycle, not on continuity.
