# Organiser pages (built by A under the flex rule)

- Status: accepted
- Date: 2026-09-27 · Owner: A, in C's folder (`src/web`) under TEAM-PLAN's flex rule; C to review

## Context

The event, track, prize and audit APIs existed with no screens, and the demo video has to show "create" from the browser. TEAM-PLAN lets A build the organiser settings pages when the web side is behind.

## Decision

- Pages under `/organizer`: your events, a new-event form, one settings page per event (name and dates, tracks, prizes, downloads) and the event's audit trail with filters.
- **The pages are not a security boundary.** They read the logged-in user to decide what to show, but every action is an API call the API authorises on its own; a page that shows a form to the wrong person still gets a 403. Server components forward the session cookie (`apiGet`); forms call the same-origin API (`apiPost` / `apiPatch` / `apiDelete`), so the CSRF Origin check applies as for any browser.
- **Dates are UTC in the UI too.** A `datetime-local` input has no time zone, so every date field is labelled "UTC" and converted explicitly (`components/organizer/dates.ts`), never through the browser's zone. An organiser in Lagos and one in Berlin see and set the same instant.
- **The API's messages are shown as they are** ("opensAt must be before submissionsClose", "A track called … exists", "… still has 6 submissions"), so the UI never guesses a rule the API enforces differently.
- **Login returns you where you were** (`/login?next=/organizer/...`), and only a path on this site is accepted as `next`, so the login page cannot be used as an open redirect.
- Built only from C's design primitives (`components/ui`); no new dependencies, no fonts or assets from the network.
- Checked in a real browser: `npm run test:ui` (Playwright's Chromium, 10 steps) against the Docker stack.

## Consequences (including what we gave up)

- The organiser list loads the first 100 events; a portal with more needs paging here.
- Destructive actions (remove a track or prize) ask with the browser's `confirm()`, not a styled dialog.
- No page yet for appointing organisers or judges; judges are B's area.
