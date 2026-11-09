# Spec: Zapier app (polling trigger + search action)

A Zapier Platform app so non-coders can wire "new arrivals on Netflix → Google Sheet / SMS / Slack". The public API needs no auth, which makes this a small app. Free dev account; public listing is free (review-gated). Lowest priority of the specs — RSS (rss-feeds.md) already unlocks Zapier's RSS trigger and IFTTT for free.

## App

Zapier Platform CLI (`zapier` npm CLI, free account) in a small repo or `zapier/` dir:

- **Authentication**: none — declare `authentication: { type: 'custom' }` with no fields. The API is keyless by design.
- **Trigger `streaming_changes`** (polling):
  - Input: `provider` dropdown — static choices mirroring `embeddableProviders()`.
  - Perform: `GET https://galaxymovies.app/api/streaming-changes?provider={key}` → emit each `added` + `coming` item; `id` = `{provider}:{tmdbType}:{tmdbId}` (stable, dedupes across polls).
  - Sample data: hardcode one Netflix-shaped item so the Zap editor shows real fields.
  - Poll cadence is Zapier-controlled (5–15 min); the feed is edge-cached + IP-limited 120/hr so a handful of Zaps can't hurt it — note the bucket in the app description.
- **Action `where_to_watch`** (search/create-type):
  - Input: `title`, optional `year`, `region`.
  - Perform: `GET /api/ext/where?title=…` (where-api.md) → returns the provider map as line-item-friendly fields (`flatrate_names`, `free_names`, …).

## Listing + review

- `zapier push` → private invite link (works immediately, free).
- Public listing: submit for review — needs the app to handle the trigger/action gracefully, a logo (reuse `public/icons/icon-512.png`), a help doc page (`/widgets` on the site can host a "Use with Zapier" section + embed code cross-links).
- Review turnaround is slow; ship invite-link first and link it from `/widgets` + `llms.txt`.

## Alternatives to note in the docs

- IFTTT: needs zero code — the RSS feeds give any user "RSS → X" applets for free. Publish a few public applets pointing at `/api/rss/*` (free) — document, don't build.
- Make: the org already uses Make internally (MCP config); a public Make app is another submission — optional, follow the same shape.

## Verify

- `zapier test` locally: trigger returns deduped items; `where_to_watch` resolves a known title.
- Invite-link end-to-end: build a real Zap against the live API, confirm items arrive hourly.
- Rate-limit math in README: one Zap on 5-min polling ≈ 288 req/day ≈ 12/hr — well inside `changes_rl` (120/hr).
