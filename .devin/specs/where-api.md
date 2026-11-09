# Spec: Public where-to-watch resolver (`GET /api/ext/where`)

Resolve a title (TMDB id, IMDb id, or title+year text) to its streaming providers in a region. This is the shared backend for the browser extension chip, the MCP `where_to_watch` tool, and Discord/Slack `/where` commands — build it first.

## Endpoint

`GET /api/ext/where`

| Param | Type | Notes |
|---|---|---|
| `id` | number | TMDB id. Requires `type`. Fastest path — used by the TMDB-page content script and any caller that already has a TMDB id. |
| `imdb_id` | string | `tt\d+` — resolved via TMDB `/find/{imdb_id}?external_source=imdb_id`. Used by the IMDb content script. |
| `title` | string | Required when `id`/`imdb_id` absent. Paired with optional `year` (4 digits). |
| `year` | string | `\d{4}`, narrows search. |
| `type` | `movie` \| `tv` | Required with `id`; otherwise searched across both. |
| `region` | string | `/^[A-Z]{2}$/`, default `US`. |

Exactly one of `id`, `imdb_id`, `title` is required — 400 otherwise.

## Resolution flow

New module `src/features/catalog/whereLookup.ts` exports `resolveWhere(opts): Promise<WhereResult | null>` so Discord/Slack handlers can call it in-process without an HTTP hop:

1. `id` + `type` → `fetchTmdb('/{type}/{id}', { append_to_response: 'external_ids' })` for title/year, then providers.
2. `imdb_id` → `fetchTmdb('/find/{imdb_id}', { external_source: 'imdb_id' })`; take `movie_results[0]` else `tv_results[0]`; null → 404.
3. `title` (+`year`) → `fetchTmdb('/search/multi', { query, year })` filtered to `media_type` movie|tv, first result (prefer exact `year` match when `year` given and `type` unset — `resolveTitleItem` in `src/features/ai/movieSearch.ts` already does fuzzy title resolution for Letterboxd imports; reuse it if it fits rather than duplicating).
4. Providers → `fetchTmdb('/{type}/{id}/watch/providers')`, read `results[region]` — same call `/api/watchProviders` makes, so `fetchTmdb`'s 6h edge cache absorbs repeats across all consumers.

All upstream calls go through `fetchTmdb` (`src/features/catalog/tmdb.ts:96`) — never raw `fetch`, so Cache-API caching and the API key stay in one place.

## Response

```json
{
  "tmdbId": 550,
  "tmdbType": "movie",
  "title": "Fight Club",
  "year": 1999,
  "region": "US",
  "providers": {
    "flatrate": [{ "id": 8, "name": "Netflix" }],
    "free": [{ "id": 73, "name": "Tubi TV" }],
    "ads": [],
    "rent": [{ "id": 2, "name": "Apple TV" }],
    "buy": []
  },
  "url": "https://galaxymovies.app/movies/550",
  "attribution": { "text": "Powered by Galaxy Movies", "url": "https://galaxymovies.app/movies/550" }
}
```

Provider entries are `{id, name}` mapped from TMDB `WatchProvider` (`src/types/tmdb.ts:164`); `link` from `WatchProvidersRegion` can be included as `tmdbLink` but `url` always points at our page. Missing categories serialize as `[]`, not absent — consumers shouldn't null-check.

## Errors

- `400` — bad/missing params, with `example` field like `streaming-changes.ts` does.
- `404` — title resolved to nothing, or no provider data in region: `{ "error": "Not found", "url": <search fallback url> }`.
- `429` — rate limited, `Retry-After: 3600`.

## Transport, caching, limits

- `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Methods: GET, OPTIONS` + 204 on OPTIONS — copy the header block from `src/pages/api/streaming-changes.ts` verbatim.
- No `rejectBot` — extension background workers and bots are the audience.
- Rate limits (only checked when the LRU misses, same cache-first ordering as `watchProviders.ts`):
  - `ext_where_rl`: 120/hr per IP.
  - `ext_where_lookup`: 800/hr per IP, cost = number of uncached upstream calls (search+find+providers).
  - `checkGlobalBudget('ext_where', 3000/hr)`.
- In-process `LRUCache` (max 5000, 24h) keyed `type|region|{id|imdb|title+year-normalized}` → full result object. Search results for popular titles get hammered by the extension; the LRU plus `setApiCache(res, 3600, 21600)` plus `fetchTmdb` edge cache means steady-state Redis cost is ~0.
- `setApiCache(res, 3600, 21600)` — the `.open-next/entry.js` s-maxage edge-cache wrapper then serves repeats off Redis entirely.

## Docs to touch

- `public/openapi.json`: add `/api/ext/where` path (keyless, attribution-required like the rest).
- `public/llms.txt`: add one line under "Open data & feeds".

## Files

- `src/pages/api/ext/where.ts` — thin route: parse, rate-limit, call `resolveWhere`, serialize.
- `src/features/catalog/whereLookup.ts` — resolution + provider fetch.
- `src/features/catalog/whereLookup.test.ts` — mock `fetchTmdb`; cover id/imdb/title paths, year preference, region miss → empty provider map, 404s.
- Edits: `public/openapi.json`, `public/llms.txt`.

## Verify

- `npm test`, `npm run typecheck`.
- `curl 'localhost:3000/api/ext/where?imdb_id=tt0137523'` → Fight Club with providers.
- `curl 'localhost:3000/api/ext/where?title=severance&type=tv'` → Severance.
- `curl -i 'localhost:3000/api/ext/where'` → 400 with example.
- e2e: add one spec hitting the route with `E2E_BASE_URL` on workers.dev — it costs TMDB calls but they're cached.
