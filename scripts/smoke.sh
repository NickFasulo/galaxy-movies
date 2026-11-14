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

# check_redirect <path> <expected redirect_url substring>
check_redirect() {
  local path="$1" want="$2"
  local out code loc
  out=$(curl -sS -m 15 -o /dev/null -w $'%{http_code} %{redirect_url}' "$BASE$path" 2>&1)
  if [ $? -ne 0 ]; then
    echo "FAIL $path (curl: $out)"
    FAIL=1
    return
  fi
  code="${out%% *}"
  loc="${out#* }"
  case "$code" in
    301|302|303|307|308)
      if printf '%s' "$loc" | grep -qF "$want"; then
        echo "ok   $path -> $loc"
      else
        echo "FAIL $path -> $code $loc (expected $want)"
        FAIL=1
      fi ;;
    403)
      echo "ok   $path (managed challenge)" ;;
    *)
      echo "FAIL $path -> HTTP $code (expected redirect to $want)"
      FAIL=1 ;;
  esac
}

check "/" "Trending"
check "/movies/550" "Fight Club"
check "/tv/1399" "tv/1399"
check "/streaming/netflix" "Netflix"
check "/leaving" "Leaving"
check "/leaving/netflix"
check "/new-on-streaming"
check "/new-on-streaming/netflix" "Netflix"
check "/this-month" "Worth It"
check "/this-month/netflix" "Netflix"
check "/reports" "reports"
check "/reports/streaming-churn" "churn"
check "/movie-night" "Movie night"
check "/alerts" "alerts"
check "/lists" "Curated"
check "/lists/cozy-night-in" "Cozy"
check "/justwatch-alternative" "JustWatch"
check "/reelgood-alternative" "Reelgood"
check "/trakt-alternative" "Trakt"
check "/whats-on-netflix-alternative" "Netflix"
check "/letterboxd-alternative" "Letterboxd"
check "/compare" "Filmatic"
check "/compare/filmatic" "Filmatic"
check "/widgets" "Widget"
check "/plus" "Galaxy Plus"
check "/embed/netflix"
check "/embed/churn" "Galaxy Movies"
check "/robots.txt" "Sitemap"
check "/sitemap.xml" "urlset"

# The crawlable /in/ space renders IN catalogs for Googlebot (US IPs) — same
# page modules as the US routes, so checks mirror them one-for-one.
check "/streaming-in-india" "JioHotstar"
check "/in/streaming/jiohotstar" "JioHotstar"
check "/in/tv/streaming/sonyliv" "SonyLIV"
check "/in/new-on-streaming" "India"
check "/in/leaving" "India"
check "/in/leaving/jiohotstar" "JioHotstar"
check "/in/this-month/jiohotstar" "JioHotstar"
check_redirect "/in" "/streaming-in-india"
check_redirect "/in/streaming" "/streaming-in-india"

# Public ICS feed: returns a valid (possibly empty) calendar even without data.
check "/api/cal/netflix" "BEGIN:VCALENDAR"

if [ "$LEVEL" = "full" ]; then
  check "/api/streaming-changes?provider=netflix" '"provider":"netflix"'
  # Freshness watchdog: the daily cron rewrites updatedAt for every provider —
  # a dead or half-truncated run leaves stale diffs on every surface with a
  # healthy 200 and no other alarm. 48h tolerates one missed run plus edge
  # cache lag; providers legitimately skipped (empty fetch) age the same way.
  ALL_CHANGES=$(curl -sSi -m 20 "$BASE/api/streaming-changes?provider=all" 2>&1)
  if printf '%s' "$ALL_CHANGES" | head -30 | grep -qiF 'cf-mitigated: challenge'; then
    echo "SKIP streaming-changes freshness (managed challenge)"
    SKIP=$((SKIP + 1))
  elif printf '%s' "$ALL_CHANGES" | grep -qF '"providers"'; then
    OLDEST=$(printf '%s' "$ALL_CHANGES" | grep -o '"updatedAt":[0-9]*' | grep -o '[0-9]*' | sort -n | head -1)
    if [ -z "$OLDEST" ]; then
      echo "FAIL streaming-changes freshness -> providers payload had no updatedAt"
      FAIL=1
    else
      AGE=$(( $(date +%s) - OLDEST / 1000 ))
      if [ "$AGE" -gt 172800 ]; then
        echo "FAIL streaming-changes freshness -> oldest updatedAt ${AGE}s (>48h)"
        FAIL=1
      else
        echo "ok   streaming-changes freshness (oldest ${AGE}s)"
      fi
    fi
  else
    echo "FAIL streaming-changes freshness -> /api/streaming-changes?provider=all unhealthy"
    FAIL=1
  fi
  # Both 503 without a seeded Redis — prod-only checks.
  check "/api/charts" '"attribution"'
  check "/api/digital-releases" '"days"'
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
