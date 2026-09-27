#!/bin/sh
# API container start-up: migrate → seed → serve.
# compose already waits for the db healthcheck; the retry loop covers the gap between
# "Postgres accepts connections" and "Postgres is fully ready" (BUILD-PLAN decision 47).
set -eu

PRISMA=/app/node_modules/.bin/prisma

attempt=1
until "$PRISMA" migrate deploy; do
  if [ "$attempt" -ge 10 ]; then
    echo "migrate deploy failed after $attempt attempts, giving up" >&2
    exit 1
  fi
  echo "migrate deploy failed (attempt $attempt); retrying in 2s in case the database is still starting" >&2
  attempt=$((attempt + 1))
  sleep 2
done

# Idempotent: safe on every boot. Imports fixtures.json and, in demo mode,
# creates the demo event and accounts and prints the test logins.
# A real event sets SEED_FIXTURES=false so the organisers' sample data never appears.
if [ "${SEED_FIXTURES:-true}" = "true" ]; then
  node dist/cli/cli.js seed --fixtures /app/data/fixtures.json
else
  echo "SEED_FIXTURES=false: skipping the fixture import"
fi

exec node dist/main.js
