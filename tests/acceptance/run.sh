#!/bin/sh
# Runs the organisers' acceptance checker against the Docker stack and writes
# acceptance-report.txt at the repo root.
#
#   npm run acceptance                 # build + start the stack, then check
#   SKIP_UP=1 npm run acceptance       # check a stack that is already running
#
# run.py is the organisers' file and is not committed: it is downloaded into .cache/
# (git-ignored) and the cached copy is reused when offline. Its fixtures lookup finds
# data/fixtures.json beside .dogfood.toml.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CACHE="$ROOT/.cache"
RUN_PY="$CACHE/run.py"
URL=https://dogfoodhack.com/spec/run.py

mkdir -p "$CACHE"
if curl -fsSL --max-time 10 "$URL" -o "$RUN_PY.tmp" 2>/dev/null; then
  mv "$RUN_PY.tmp" "$RUN_PY"
else
  rm -f "$RUN_PY.tmp"
  [ -f "$RUN_PY" ] || { echo "run.py not cached and $URL unreachable" >&2; exit 1; }
  echo "offline: using cached run.py" >&2
fi

cd "$ROOT"
if [ "${SKIP_UP:-0}" != "1" ]; then
  docker compose up -d --build --wait
fi

status=0
python3 "$RUN_PY" .dogfood.toml --fixtures data/fixtures.json > acceptance-report.txt || status=$?
cat acceptance-report.txt
exit $status
