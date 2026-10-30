#!/usr/bin/env bash
# Boots the built worker under `wrangler dev` (real workerd runtime) and runs
# the Playwright suite against it. Requires a prior `npm run cf:build` —
# wrangler serves .open-next/entry.js. Used by e2e.yml so browser-level
# regressions run against the same bundle prod serves.
set -u

PORT="${E2E_PORT:-8789}"
VARS=()
if [ -z "${TMDB_API_KEY:-}" ]; then
  echo "TMDB_API_KEY is required — e2e specs assert real catalog content."
  exit 1
fi
# wrangler dev does not read .env.local — forward the key explicitly. It's the
# only secret tests need; everything else stays absent like keyless CI.
VARS+=(--var "TMDB_API_KEY:$TMDB_API_KEY")

npx wrangler dev --port "$PORT" --ip 127.0.0.1 --log-level warn "${VARS[@]}" >/tmp/workerd-e2e.log 2>&1 &
WPID=$!
trap 'kill "$WPID" 2>/dev/null || true' EXIT

READY=0
for _ in $(seq 1 90); do
  curl -s -o /dev/null -m 2 "http://127.0.0.1:$PORT/" && READY=1 && break
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "worker did not boot; wrangler log follows"
  cat /tmp/workerd-e2e.log
  exit 1
fi

E2E_BASE_URL="http://127.0.0.1:$PORT" npx playwright test
