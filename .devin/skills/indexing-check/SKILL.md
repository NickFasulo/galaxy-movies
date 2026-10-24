---
name: indexing-check
description: Check whether upcoming-release pages (US + IN) are indexed in Google, flag the ones that aren't, and drive the manual "Request indexing" step. Use when the user asks to check indexing, request indexing, or verify release pages are in Google.
---

# Indexing check for upcoming releases

Release-day title queries are this site's proven traffic pattern (a page only
wins the spike if Google indexed it before release day). This skill checks the
same upcoming set the streaming-changes cron pings and warms, reports index
status, and produces pre-filled Search Console inspect links for the misses.

## Run

```bash
npm run index:check          # top 12 by TMDB popularity
npm run index:check -- --top 20
```

Output: `INDEXED`/`PENDING` per title with Google's coverage state and last
crawl date, then one GSC inspect deep-link per unindexed page.

## Requirements

- `.secrets-gsc.json` — a GCP service-account key (gitignored via
  `.secrets*.json`) with the Search Console API enabled, added as a user on the
  property. If missing, the script prints the setup steps.
- `GSC_SITE_URL` in `.env.local` only if the property is URL-prefix
  (`https://www.galaxymovies.app/`) instead of the default `sc-domain:` form.

## What to do with PENDING rows

"Request indexing" has no API — Google's Indexing API only covers JobPosting
and BroadcastEvent pages. The script's inspect links open the URL Inspection
tool pre-filled; request indexing is one click inside (~10–15/day quota).

- If the user can open links locally: hand them the list, done.
- If the user wants full automation: drive a logged-in browser session to the
  inspect links and click "Request Indexing" — flag that this is fragile
  (Google sign-in state, reCAPTCHA) before attempting.
- Re-running after requests is fine — the inspect call is read-only and cheap.

## Cadence

Weekly, or before a named blockbuster release. Prioritize anything PENDING
within ~14 days of release — that's the window where the warm queue and
IndexNow are already working but Google hasn't caught up.
