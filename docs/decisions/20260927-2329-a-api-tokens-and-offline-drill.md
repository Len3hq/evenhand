# API tokens from the shell, and an offline drill that proves the One Command Rule

- Status: accepted
- Date: 2026-09-27 · Owner: A

## Context

The token ADR (20260926-1310) left a "rotate tokens / disable demo" command unwritten, and BUILD-PLAN decision 33 named it `cli rotate-tokens`. A real deployment had no way to give a script a token, or to shut the published demo tokens other than turning demo mode off.

The offline claim was checked only by one probe from the api container. Nothing showed that a fresh clone, with no internet at all, passes the checker and works in a browser, and the Prisma CLI that migrates on every start still tried to report its version to `checkpoint.prisma.io` (the internal network blocked it; it should not try).

## Decision

- **`cli tokens create <email> --label <label>`** issues a 256-bit bearer token for an existing account, printed once as a ready-to-paste header and stored as SHA-256. It acts with that account's roles. `tokens list [<email>]` shows id, account, label, demo or not, and state, never the secret or hash. `tokens revoke <id>` and `tokens revoke --demo` set `revoked_at`; the guard refuses a revoked token from the next request. Issuing and revoking are audited by label (`token.created`, `token.revoked`).
- **Revoke, not rotate.** New demo tokens would have to match the committed `.dogfood.toml`, so rotating them buys nothing. The operator revokes them, and issues their own tokens. The seeder never recreates a revoked demo token, so a restart does not undo the revocation.
- **Tokens stay a shell operation.** As with `create-admin`: whoever can run commands in the container already controls the database, so no web page adds a token-minting surface.
- **The offline drill** (`npm run drill`, `tests/offline/drill.sh`): clone HEAD (or copy the working tree with `DRILL_SOURCE=worktree`), build online, then start on empty volumes with an overlay that makes every network internal, publishes no port and uses drill-only image names. A request to example.com must work before the cut and fail from the api and the web container's network after it. `run.py` and every browser check then run in a container that shares the web container's network, so `localhost:8080` is the portal (the address `.dogfood.toml` and the Origin check expect) and nothing else is reachable. CI runs it on every push.
- **`CHECKPOINT_DISABLE=1`** in the api image, and in CI.

## Consequences (including what we gave up)

- There are no per-token scopes or expiry: a token is as strong as its account until revoked. Enough for an event's scripts; scoped tokens would be the next step.
- The drill needs Docker and, for its preparation step only, the network (image builds, the playwright package, `run.py`). It proves the running stack needs no network; it cannot prove the build is reproducible offline, which the spec does not ask.
- The drill runs beside a stack already on :8080 and never replaces its images or volumes.
