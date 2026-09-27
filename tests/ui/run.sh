#!/bin/sh
# Browser checks: a real Chromium (Playwright's official image) runs every tests/ui/*.check.mjs
# against the running stack, as the demo users and freshly registered ones.
#
#   docker compose up -d --wait && npm run test:ui
#
# Needs the network once, to pull the image and the playwright package (development only;
# the portal itself never needs it). The browser addresses the portal as localhost:8080, so
# the API's same-origin (CSRF) check sees exactly what a real browser sends. The checks add
# their own events and accounts; they never change existing ones.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLAYWRIGHT=1.55.0
docker run --rm -v "$ROOT/tests/ui:/ui:ro" "mcr.microsoft.com/playwright:v$PLAYWRIGHT-noble" sh -c "
  mkdir -p /work && cd /work && cp /ui/*.mjs . &&
  npm init -y >/dev/null && npm i --no-audit --no-fund --loglevel=error playwright@$PLAYWRIGHT >/dev/null &&
  status=0; for f in *.check.mjs; do node \"\$f\" || status=1; done; exit \$status"
