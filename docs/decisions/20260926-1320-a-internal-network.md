# db and api on an internal Docker network

- Status: accepted
- Date: 2026-09-26 · Owner: A

## Context

Rule: no external API at runtime; the portal must run with the network off.

## Decision

`db` and `api` join only `backend` (`internal: true`, no route to the internet). `web` joins `backend` and `edge` and publishes :8080. The dev overlay also puts `db` on `edge` to publish port 5433.

## Consequences

Any accidental outbound call from the API fails immediately, in development as well as in the offline test. Verified: egress from the api container fails (`EAI_AGAIN`), and the stack still boots, seeds and passes run.py.
