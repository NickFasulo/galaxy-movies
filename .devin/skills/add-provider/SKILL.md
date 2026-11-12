---
name: add-provider
description: Onboard a new streaming provider across the ~60 touch points — provider registry, Watchmode name matching, embed eligibility, affiliate mapping, region catalogs, sitemap floors, and tests. Use when adding a streaming service, registering a provider key, or wiring a new source into the diffs.
---

# Adding a streaming provider

Provider keys fan out from `src/features/catalog/tmdb.ts` into ~60 files.
Work this list in order — ingestion must land before surfaces reference the
key, or pages render empty/odd states.

## 1. Registry (the source of truth)

`src/features/catalog/tmdb.ts`:

- `streamingProviders` — add `{ title, ids: { default|US|IN: <tmdbId|id[]> },
  regions: [...] }`. The `title` is the display label (a ` Movies` suffix is
  stripped in some UIs — see the VI entry's comment).
- `PROVIDER_NAME_MATCH` — the key → Watchmode source-name regex. Required
  for `coming`/`leaving` (Watchmode) diffs. **US-only**: IN providers diff
  from TMDB snapshots and never carry `coming` data — that's why
  `isEmbeddableProvider` (`src/features/catalog/embed.ts`) intersects both
  maps.

## 2. Check what the key unlocks automatically

These read the registry, no per-key edits needed: `/streaming/{p}`,
`/leaving/{p}`, `/new-on-streaming/{p}`, `/this-month/{p}`, `/embed/{p}` (if
embeddable), `/api/rss/{p}`, `/api/cal/{p}`, `/api/og-leaving`,
`/api/streaming-changes`, watchlist-alert matching, social channels,
`/api/reddit-payload`, the game (`features/game/questions.ts`), ServicesPicker,
`/in/` space if `regions` includes `IN`.

## 3. Explicit follow-ups

- **Affiliates**: merchant mapping in `src/features/monetize/takeads.ts`
  (and the IN-coverage comment there if the provider is IN).
- **Sitemap floors**: provider pages gate on `MIN_INDEXABLE_MOVIES` and the
  `catalog:size:{region}` hash — a brand-new provider stays out of the
  sitemap until the first `catalog:size` write; that's expected, not a bug.
- **`changes:sources:stale`/source-id map**: the Watchmode source id resolves
  by name match — if the regex misses, diffs silently skip the provider.
  Check `wm:last-status` / first run output.
- **Tests**: `streamingChanges.test.ts`, `embed.test.ts` fixtures may need
  the key; e2e asserts are stable-id-based so they rarely change.
- **Plus alert matching**: Plus subscribers match every `PROVIDER_NAME_MATCH`
  source — a new key widens their coverage automatically.

## 4. Verify

- `npm test` + `npm run typecheck`.
- After deploy + one streaming-changes cron run: check
  `changes:{catalog,diff}:{key}` exists in Redis and
  `/api/streaming-changes?provider=<key>` returns data — the first diff run
  is the only real proof the name-match regex landed.
