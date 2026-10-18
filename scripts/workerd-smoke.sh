#!/usr/bin/env bash
# Boots the built worker under `wrangler dev` (real workerd runtime) and runs
# the core smoke set against it. Requires a prior `npm run cf:build` — wrangler
# serves .open-next/entry.js. Used by ci.yml so workerd-only breakage (fs,
# TCP, WASM-instantiate, export-condition drift) fails in CI, not at deploy.
set -u

PORT="${SMOKE_PORT:-8788}"
VARS=()
# wrangler dev does not read .env.local — forward any upstream keys explicitly
# so pages render with real data instead of degrading to errors.
[ -n "${TMDB_API_KEY:-}" ] && VARS+=(--var "TMDB_API_KEY:$TMDB_API_KEY")

# ${VARS[@]+...} is the bash 3.2-safe way to expand a possibly-empty array under set -u
npx wrangler dev --port "$PORT" --ip 127.0.0.1 --log-level warn ${VARS[@]+"${VARS[@]}"} >/tmp/workerd-smoke.log 2>&1 &
WPID=$!
trap 'kill "$WPID" 2>/dev/null || true' EXIT

READY=0
for _ in $(seq 1 90); do
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/" && READY=1 && break
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "worker did not boot; wrangler log follows"
  cat /tmp/workerd-smoke.log
  exit 1
fi

SMOKE_BASE="http://127.0.0.1:$PORT" SMOKE_LEVEL=core bash "$(dirname "$0")/smoke.sh"
