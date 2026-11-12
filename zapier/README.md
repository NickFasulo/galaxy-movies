# Galaxy Movies Zapier app

Zapier Platform app wrapping the public API — one polling trigger + one search action, no auth.

- **Trigger `streaming_changes`** — new/announced arrivals per US service; stable `provider:tmdbType:tmdbId` ids dedupe across polls and the coming→added transition.
- **Search `where_to_watch`** — title → provider lists (line-item arrays + comma-joined `*_names`).

## Develop

```
npm install
npm test          # zapier test (mocha, hits the live keyless API)
npx zapier validate
npx zapier login && npx zapier push   # needs a zapier.com account
```

`.zapierapprc` (created by `zapier register`/`push`) maps this dir to the Zapier app id — commit it so pushes target the same app.

## Rate-limit math

The feed is IP-limited to 120 req/hr. One Zap on the default ~5-min poll ≈ 12 req/hr; even 8 Zaps stay at ~96/hr. The feed is edge-cached, so poll cadence is Zapier's, not ours.
