#!/bin/sh
# Offline drill: the One Command Rule, tested the way a judge meets it.
#
#   npm run drill           # or: sh tests/offline/drill.sh
#   KEEP=1 npm run drill    # leave the drill stack running afterwards (project evenhand-drill)
#   DRILL_SOURCE=worktree npm run drill
#                           # test the working tree (tracked + new, non-ignored files) before
#                           # committing, instead of a clone of HEAD
#
# 1. Clones the committed HEAD into a temporary folder (uncommitted changes are not included).
# 2. Online, once: builds the images from that clone, installs the browser checks' playwright
#    package, and makes sure the organisers' run.py is cached.
# 3. Cuts the network: starts the clone's stack with every network internal and no published
#    port (offline.compose.yml), on empty volumes.
# 4. Proves the cut: a request to the internet must fail from the api and from the web
#    container's network (the same request is made online first, so the probe itself works).
# 5. Inside the web container's network, where localhost:8080 is the portal and nothing else
#    is reachable: runs run.py against .dogfood.toml and every browser check (tests/ui).
#
# Needs Docker, git and the network for step 2 only. Runs beside a stack you already have up.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PROJECT=evenhand-drill
PLAYWRIGHT=1.55.0
RUNNER="mcr.microsoft.com/playwright:v$PLAYWRIGHT-noble"
# example.com is reserved by IANA for exactly this and does not go away after the event.
PROBE_URL=https://example.com/
WORK=$(mktemp -d "${TMPDIR:-/tmp}/evenhand-drill.XXXXXX")
REPO="$WORK/repo"
USER_ARGS="--user $(id -u):$(id -g) -e HOME=/tmp"

say() { printf '\n== %s\n' "$*"; }
compose() { docker compose -p "$PROJECT" -f "$REPO/docker-compose.yml" -f "$REPO/tests/offline/offline.compose.yml" "$@"; }
# shellcheck disable=SC2317 # called by the trap below
cleanup() {
  code=$?
  if [ "${KEEP:-0}" = "1" ] && [ -d "$REPO" ]; then
    echo "KEEP=1: stack left running; remove it with: docker compose -p $PROJECT down -v"
  elif [ -d "$REPO" ]; then
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# A request to the internet from Node. Prints "reached" or "no route".
PROBE="fetch('$PROBE_URL',{signal:AbortSignal.timeout(8000)}).then(()=>console.log('reached'),()=>console.log('no route'))"

if [ "${DRILL_SOURCE:-head}" = "worktree" ]; then
  say "1/5 copy of the working tree (DRILL_SOURCE=worktree)"
  mkdir -p "$REPO"
  (cd "$ROOT" && git ls-files -z --cached --others --exclude-standard | tar -cf - --null -T -) |
    tar -xf - -C "$REPO"
  echo "working tree at $(git -C "$ROOT" rev-parse --short HEAD) plus uncommitted changes"
else
  say "1/5 fresh clone of the committed HEAD"
  if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    echo "note: uncommitted changes are not part of the drill (it tests what a judge would clone)"
  fi
  git clone --quiet "$ROOT" "$REPO"
  echo "commit $(git -C "$REPO" rev-parse --short HEAD)"
fi

say "2/5 online preparation: images, playwright package, run.py"
compose build --quiet
mkdir -p "$WORK/pw"
cp "$REPO"/tests/ui/*.mjs "$WORK/pw/"
# shellcheck disable=SC2086
docker run --rm $USER_ARGS -v "$WORK/pw:/work" -w /work "$RUNNER" sh -c \
  "npm init -y >/dev/null && npm i --no-audit --no-fund --loglevel=error playwright@$PLAYWRIGHT >/dev/null"
RUN_PY="$ROOT/.cache/run.py"
mkdir -p "$ROOT/.cache"
if curl -fsSL --max-time 10 https://dogfoodhack.com/spec/run.py -o "$RUN_PY.tmp" 2>/dev/null; then
  mv "$RUN_PY.tmp" "$RUN_PY"
else
  rm -f "$RUN_PY.tmp"
  [ -f "$RUN_PY" ] || { echo "run.py is not cached and cannot be downloaded" >&2; exit 1; }
fi
cp "$RUN_PY" "$WORK/run.py"
control=$(docker run --rm "$RUNNER" node -e "$PROBE")
echo "control probe with network: $control"
[ "$control" = "reached" ] || { echo "the probe cannot reach $PROBE_URL even online; cannot prove the cut" >&2; exit 1; }

say "3/5 network cut: docker compose up on empty volumes, every network internal"
compose down -v --remove-orphans >/dev/null 2>&1 || true
compose up -d --wait --pull never --no-build
WEB=$(compose ps -q web)

say "4/5 proving the cut"
api_probe=$(compose exec -T api node -e "$PROBE")
web_probe=$(docker run --rm --network "container:$WEB" "$RUNNER" node -e "$PROBE")
echo "api container:       $api_probe"
echo "web container's net: $web_probe"
if [ "$api_probe" != "no route" ] || [ "$web_probe" != "no route" ]; then
  echo "the stack can reach the internet: the cut failed" >&2
  exit 1
fi

say "5/5 checks with no network: run.py, then the browser checks"
status=0
# shellcheck disable=SC2086
docker run --rm $USER_ARGS --network "container:$WEB" \
  -v "$REPO:/repo:ro" -v "$WORK/run.py:/run.py:ro" -w /repo "$RUNNER" \
  python3 /run.py .dogfood.toml --fixtures data/fixtures.json || status=1
# shellcheck disable=SC2086
docker run --rm $USER_ARGS --network "container:$WEB" -e UI_HOST_MAP=off \
  -v "$WORK/pw:/work" -w /work "$RUNNER" \
  sh -c 'status=0; for f in *.check.mjs; do node "$f" || status=1; done; exit $status' || status=1

if [ $status -eq 0 ]; then
  say "offline drill passed: fresh copy, empty database, no network, every check green"
else
  say "offline drill FAILED (see above)"
fi
exit "$status"
