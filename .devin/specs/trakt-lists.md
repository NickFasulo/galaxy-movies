# Spec: Auto-maintained public Trakt lists

Public lists under a `galaxymovies` brand account on Trakt ("New on Netflix this week", "Leaving soon — March 2026"), refreshed weekly by a cron. Trakt's list pages are discoverable inside Trakt and get indexed by Google — free reach into the exact audience for this data.

## Auth: one-time brand token

Trakt has no service accounts — create a normal account `galaxymovies` and OAuth it once:

- `scripts/trakt-brand-auth.js` — plain-JS script implementing the PKCE flow standalone (authorize URL → user pastes the `?code` back → token exchange). Constants come from `src/features/billing/trakt.ts` (`TRAKT_AUTH`, `TRAKT_UA`, `TRAKT_CLIENT_ID`); the script can't import TS, so duplicate the 3 constants or have it read them — simplest is duplicating with a comment pointing at the source.
- Output: `TRAKT_BRAND_REFRESH_TOKEN` → `.env.local` + `npm run cf:secrets`.
- Runtime refresh reuses `refreshTokens()` + `TRAKT_UA` from `billing/trakt.ts`. Store the rotated refresh token back — Trakt rotates on every refresh (same pattern `traktAccessToken` uses with Redis `TRAKT_KEY`; simplest: keep the brand token in a Redis hash `gm:trakt:brand` seeded from the env var on first run — survives rotation, env var is the bootstrap/recovery path).

## List maintenance

New module `src/features/social/traktLists.ts`:

- `ensureList(slug, { name, description, privacy: 'public' })` — `GET /users/{me}/lists` once per run (memoized per instance), `POST /users/{me}/lists` when missing.
- `replaceItems(slug, items)` — `POST /users/{me}/lists/{slug}/items` with the full desired set (`{movies: [{ids:{tmdb}}], shows: [...]}` — Trakt appends, so first `POST .../items/remove` with the *currently listed* ids to make runs idempotent; or use the add+remove diff — remove-then-add is simpler and lists are small).
- Trakt free-tier lists cap out; cap items at 50, ordered by `popularity` desc.
- All API calls carry `trakt-api-version: 2`, `trakt-api-key: TRAKT_CLIENT_ID`, `Authorization: Bearer`, `User-Agent: TRAKT_UA` — mirror `postSync`/`getSync` in `billing/trakt.ts` (consider exporting a generic `traktFetch` from that file instead of a third copy).

## Cron

`src/pages/api/cron/trakt-lists.ts` gated by `isCronAuthorized`, `maxDuration: 60`:

1. Refresh brand token (Redis → env fallback).
2. `getProviderChanges(BROADCAST_PROVIDERS or top ~8 providers)` + `getMonthlyChanges` for departures.
3. Maintain lists:
   - `new-on-{provider}-this-week` per top provider — from `added` (cap 50, popularity-sorted); skip the provider entirely when `added` is empty rather than publishing an empty list.
   - `leaving-soon-{YYYY}-{MM}` — merged `leavingSoon`/`departed` across providers, dated, month-keyed slug.
4. Skip gracefully (`token not configured` result) when the env/Redis token is absent — env-gated like `SOCIAL_CHANNELS` `ready()` checks, so it costs nothing unconfigured.
5. Return a JSON summary `{ updated: [...], skipped: [...] }` like other crons.

Schedule: weekly, `"0 18 * * 2"` (Tue 18:00 UTC — after Monday's `social-broadcast`, same content different surface). Add to `vercel.json` crons, `wrangler.jsonc` `triggers.crons`, and the cron-path map in `scripts/opennext-postbuild.js`/`.open-next/entry.js` — all three, or prod never fires.

## Env

| Var | Notes |
|---|---|
| `TRAKT_BRAND_REFRESH_TOKEN` | bootstrap secret; rotated value persists in Redis `gm:trakt:brand` |
| `TRAKT_BRAND_USERNAME` | default `galaxymovies` |

## Files

- `src/features/social/traktLists.ts` + `traktLists.test.ts` (item mapping, cap, remove-then-add ordering, skip-on-empty).
- `src/pages/api/cron/trakt-lists.ts`.
- `scripts/trakt-brand-auth.js`.
- `vercel.json`, `wrangler.jsonc`, `scripts/opennext-postbuild.js` cron wiring.

## Verify

- `npm test`, `npm run typecheck`.
- `node scripts/trakt-brand-auth.js` locally → authorize → token stored.
- `curl -H 'Authorization: Bearer $CRON_SECRET' localhost:8789/api/cron/trakt-lists` under `wrangler dev` → lists created on the brand profile (visible at trakt.tv/users/galaxymovies/lists).
- Re-run → no duplicate items (remove-then-add works).
