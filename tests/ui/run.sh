#!/bin/sh
# Browser checks: a real Chromium (Playwright's official image) runs every tests/ui/*.check.mjs
# against the running stack, as the demo users and freshly registered ones.
#
#   docker compose up -d --wait && npm run test:ui
#
# Needs the network once, to pull the image and the playwright package (development only;
# the portal itself never needs it). The browser addresses the portal as localhost:8080, so
# the API's same-origin (CSRF) check sees exactly what a real browser sends. --add-host makes
# host.docker.internal resolve on Linux too (Docker Desktop provides it already). The checks add
# their own events and accounts; they never change existing ones.
#
# Logins and registrations are limited per email (RATE_LIMIT_LOGIN_PER_MIN, 10 a minute); the
# checks register fresh accounts each run, so two runs back to back stay well inside it.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLAYWRIGHT=1.55.0
docker run --rm --add-host=host.docker.internal:host-gateway -v "$ROOT/tests/ui:/ui:ro" "mcr.microsoft.com/playwright:v$PLAYWRIGHT-noble" sh -c "
  mkdir -p /work && cd /work && cp /ui/*.mjs . &&
  npm init -y >/dev/null && npm i --no-audit --no-fund --loglevel=error playwright@$PLAYWRIGHT >/dev/null &&
  status=0; for f in *.check.mjs; do node \"\$f\" || status=1; done; exit \$status"
