#!/bin/sh
# Browser check of the organiser pages: a real Chromium (Playwright's official image) logs in
# as the demo organiser and creates, edits and audits an event on the running stack.
#
#   docker compose up -d --wait && npm run test:ui
#
# Needs the network once, to pull the image and the playwright package (development only;
# the portal itself never needs it). The browser addresses the portal as localhost:8080, so
# the API's same-origin (CSRF) check sees exactly what a real browser sends.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLAYWRIGHT=1.55.0
docker run --rm -v "$ROOT/tests/ui:/ui:ro" "mcr.microsoft.com/playwright:v$PLAYWRIGHT-noble" sh -c "
  mkdir -p /work && cd /work && cp /ui/organizer.check.mjs . &&
  npm init -y >/dev/null && npm i --no-audit --no-fund --loglevel=error playwright@$PLAYWRIGHT >/dev/null &&
  node organizer.check.mjs"
