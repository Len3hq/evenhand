# Authentication: bearer tokens and cookie sessions

- Status: accepted
- Date: 2026-09-26 · Owner: A

## Context

The checker never logs in: it attaches a header we give it. Browsers need a normal login.

## Decision

- API clients: `Authorization: Bearer <token>`, stored as SHA-256 in `api_tokens`. Four fixed demo tokens (no `#`, which run.py's fallback TOML parser would cut) match `.dogfood.toml`; `is_demo` tokens are refused unless `DEMO_MODE=true`.
- Browsers: `POST /api/auth/login` sets an httpOnly, SameSite=Lax `session` cookie (random 256-bit value, SHA-256 stored in `sessions`).
- CSRF: cookie-authenticated writes must carry an allowed `Origin`/`Referer`. Bearer requests are exempt (not ambient).
- Passwords: argon2id; unknown emails are verified against a dummy hash so timing does not reveal accounts.

## Consequences

Every seeded account shares the demo password in demo mode. A "rotate tokens / disable demo" command is still to be written; until then set `DEMO_MODE=false`.
