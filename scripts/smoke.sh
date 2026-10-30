#!/usr/bin/env bash
# Post-deploy sanity probe. Run right after `npm run cf:deploy`:
#   bash scripts/smoke.sh
# Target the workers.dev URL (or any host) with SMOKE_BASE:
#   SMOKE_BASE=https://galaxy-movies.winter-rice-c91a.workers.dev bash scripts/smoke.sh
set -u

BASE="${SMOKE_BASE:-https://www.galaxymovies.app}"
# core = no Redis-backed endpoints or apex redirect — used against `wrangler
# dev` in CI, where secrets are deliberately absent. full = production probe.
LEVEL="${SMOKE_LEVEL:-full}"
FAIL=0
SKIP=0

# check <path> [substring expected in the body]
check() {
  local path="$1" want="${2:-}"
  local out code body
  # -i keeps response headers in the output: paths behind the managed-challenge
  # WAF rule answer curl with 403 + cf-mitigated: challenge — on prod that IS
  # the healthy response (the edge is enforcing); hosts without the zone rules
  # (workers.dev, wrangler dev) fall through to the normal 200 check.
  out=$(curl -sSi -m 15 -w $'\n%{http_code}' "$BASE$path" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FAIL $path (curl: $out)"
    FAIL=1
    return
  fi
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
  if printf '%s' "$body" | head -30 | grep -qiF 'cf-mitigated: challenge'; then
    echo "ok   $path (managed challenge)"
    return
  fi
  if [ "$code" != "200" ]; then
    echo "FAIL $path -> HTTP $code"
    FAIL=1
    return
  fi
  if [ -n "$want" ] && ! printf '%s' "$body" | grep -qF "$want"; then
    echo "FAIL $path -> 200 but missing '$want'"
    FAIL=1
    return
  fi
  echo "ok   $path"
}

check "/" "Trending"
check "/movies/550" "Fight Club"
check "/tv/1399" "tv/1399"
check "/streaming/netflix" "Netflix"
check "/leaving/netflix"
check "/new-on-streaming"
check "/embed/netflix"
check "/robots.txt" "Sitemap"
check "/sitemap.xml" "urlset"

if [ "$LEVEL" = "full" ]; then
  check "/api/streaming-changes?provider=netflix" '"provider":"netflix"'
fi

# The IndexNow ownership file must be served or every ping 403s upstream.
KEY=$(grep -o "INDEXNOW_KEY = '[^']*'" "$(dirname "$0")/../src/lib/indexnow.ts" | cut -d"'" -f2)
if [ -n "$KEY" ]; then
  check "/$KEY.txt" "$KEY"
fi

if [ "$LEVEL" = "full" ]; then
  # Apex must 30x to the canonical www host — a broken redirect splits indexing.
  APEX=$(curl -sS -m 15 -D - -o /dev/null -w $'\n%{http_code} %{redirect_url}' "https://galaxymovies.app/" 2>&1)
  APEX_EXIT=$?
  APEX_RESULT="${APEX##*$'\n'}"
  APEX_HEADERS="${APEX%$'\n'*}"
  if [ "$APEX_EXIT" -ne 0 ]; then
    echo "FAIL apex redirect (curl: $APEX)"
    FAIL=1
  elif [[ "$APEX_RESULT" == "403 " ]] &&
    printf '%s\n' "$APEX_HEADERS" | grep -qiE $'^cf-mitigated:[[:blank:]]*challenge[[:blank:]]*\r?$'; then
    echo "SKIP apex -> managed challenge (www redirect not verified)"
    SKIP=$((SKIP + 1))
  else
    case "$APEX_RESULT" in
      301\ https://www.galaxymovies.app/*|302\ https://www.galaxymovies.app/*|303\ https://www.galaxymovies.app/*|307\ https://www.galaxymovies.app/*|308\ https://www.galaxymovies.app/*)
        echo "ok   apex -> www redirect" ;;
      *) echo "FAIL apex redirect -> $APEX_RESULT"; FAIL=1 ;;
    esac
  fi
fi

if [ "$FAIL" -ne 0 ]; then
  echo "smoke: failures against $BASE"
  exit 1
fi
echo "smoke: checks passed against $BASE ($SKIP skipped)"
