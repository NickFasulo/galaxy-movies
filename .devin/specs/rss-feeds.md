# Spec: RSS feeds for streaming changes (`/api/rss/*`)

Per-provider RSS 2.0 feeds of arrivals, departures, and announced releases. Unlocks RSS readers, IFTTT/Zapier triggers, and rss-to-email/Telegram bridges for $0 — and mirrors the ICS feed (`src/pages/api/cal/[provider].ts`) almost line for line.

## Endpoints

- `GET /api/rss/{provider}` — also accept `{provider}.xml` (strip the suffix like `.ics` is stripped in the cal route).
- `GET /api/rss/all` — one merged feed across embeddable providers; items prefixed with the provider name.
- Providers = the embeddable US set (`isEmbeddableProvider` in `src/features/catalog/embed.ts`), same allowlist as `/api/cal/*` and `/api/streaming-changes`.

## Feed construction

New builder `src/features/catalog/rss.ts`:

- Items come from `publicProviderEvents(provider, changes[provider], monthly[provider])` (`src/features/alerts/calendar.ts:169`) for dated events (coming/leaving/arrived/departed) — same source as the ICS feed, so a feed item and a calendar entry never disagree.
- Plus undated items from `changes.added` / `changes.left` (ICS skips these because VEVENT needs a date; RSS doesn't): `pubDate` = `change.updatedAt`, guid = `pub:{provider}:{type}:{tmdbId}:{kind}` matching the existing uid scheme.
- `<item>` fields: `title` = event summary ("X comes to Netflix"), `link` = `e.url` (title page on galaxymovies.app), `guid` = `e.uid` (`isPermaLink="false"`), `pubDate` = RFC-822 of `e.date` (dated) or `e.stamp` (undated), `category` = kind (`coming|leaving|arrived|departed|added|left`), `source` attr or description line = provider label.
- `<channel>`: `title` = `"{Provider} arrivals & departures — Galaxy Movies"`, `link` = `{SITE_URL}/leaving/{provider}`, `description` with the attribution sentence from `openapi.json` ("Powered by Galaxy Movies … keep it when republishing"), `<atom:link rel="self">` pointing at the feed URL, `ttl` = 60.
- Sort items newest-first, cap at 50.
- XML-escape all interpolated text (`&<>"'`); build with string concat — no dep needed for ~30 lines.

## Route

`src/pages/api/rss/[provider].ts`, structurally identical to `api/cal/[provider].ts`:

- `requireMethod GET`, no `rejectBot` (feed readers have their own UAs).
- Validate slug → `isEmbeddableProvider` (the cal route uses `PROVIDER_NAME_MATCH && streamingProviders`; use the same predicate for consistency — for `all`, skip validation and fan out over `embeddableProviders()`).
- Rate limit `rss_rl`: 60/hr per IP via `checkDistributedRateLimit`.
- `Promise.all([getProviderChanges([slug]), getMonthlyChanges([slug])])` (or the full key list for `all`).
- `Content-Type: application/rss+xml; charset=utf-8`, `setApiCache(res, 3600, 86400)`.
- 404 `Unknown provider`, 500 `Could not build feed` — mirror cal route strings.

## Discovery + docs

- `<link rel="alternate" type="application/rss+xml" href="/api/rss/{provider}">` in `<Head>` of `/leaving/[provider]` pages and `/new-on-streaming` (the `all` feed there).
- `/widgets` page: add a "Feeds" section listing the RSS URL pattern next to the ICS/iframe embeds.
- `public/llms.txt`: one line under "Open data & feeds".
- `public/openapi.json`: optional — it's for the JSON feed; a `paths` entry is nice-to-have, not required.

## Files

- `src/features/catalog/rss.ts` + `src/features/catalog/rss.test.ts` (escaping, sort, undated items get guids, cap at 50).
- `src/pages/api/rss/[provider].ts`.
- Small edits: `/leaving/[provider]` head, `/new-on-streaming` head, `/widgets`, `public/llms.txt`.

## Verify

- `npm test`, `npm run typecheck`, `npm run lint`.
- `curl -s localhost:3000/api/rss/netflix | head -30` — valid XML, items present.
- Validate output at a W3C feed validator (paste, not automated).
- `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/rss/nope` → 404; OPTIONS/POST → 405.
- Feed-reader smoke: `npx rss-parser` in a scratch script or `netnewswire` manual check — items show newest-first with working links.
