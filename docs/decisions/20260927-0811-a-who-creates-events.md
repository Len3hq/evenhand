# Who can create an event

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

T1 needs "event creation with configurable dates, tracks and prizes". The plans fix the route (`POST /events`) but not who may call it. Roles are per event (a user can judge one event and compete in another), so "organiser" means "organiser of some event", and a brand-new deployment has no events at all.

## Decision

`POST /events` is allowed for platform admins and for anyone who already organises at least one event. The creator is made `ORGANIZER` of the new event in the same transaction, with an `event.created` audit row. Everyone else gets 403 before anything is read.

A fresh deployment starts with `cli create-admin`; that admin creates the first event, and organisers can then create more events without asking.

The slug is fixed at creation so links keep working. Dates must carry a time zone and satisfy `opens_at < submissions_close < judging_close`, checked again on every edit after merging with the stored values. `opens_at` is enforced by the deadline rule, not only displayed.

## Consequences (including what we gave up)

- Not self-service: a stranger cannot sign up and run an event on someone else's portal. For a self-hosted portal run by one organisation that is the point; a public "anyone can host" mode would need moderation we are not building.
- An organiser of one event can create unlimited further events. Acceptable for a trusted organiser group; every creation is audited.
- Appointing further organisers to an existing event is not in the API yet; it is a later increment.
