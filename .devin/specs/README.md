# Distribution specs — free surfaces

Implementation-ready specs for free (or near-free) channels that put Galaxy Movies in front of new users. Each file is standalone — hand one to an agent and it has everything it needs. They build on existing surfaces: `/api/streaming-changes` (CORS-open), `/api/cal/*` ICS feeds, `/embed/*` widgets, `getProviderChanges`/`getMonthlyChanges`, and the Trakt machinery in `src/features/billing/trakt.ts`.

| # | Spec | Surface | Repo | Runtime cost | Distribution | Cost |
|---|---|---|---|---|---|---|
| 1 | [where-api.md](where-api.md) | `GET /api/ext/where` | this repo | TMDB calls, edge-cached | shared backend for 2/4/5/9 | $0 |
| 2 | [rss-feeds.md](rss-feeds.md) | `/api/rss/*` | this repo | none (cached Redis snapshot) | RSS readers, IFTTT, rss-to-X | $0 |
| 3 | [browser-extension.md](browser-extension.md) | where-to-watch chip + popup | `galaxy-movies-extension` | hits cached APIs | FF AMO + Edge free, Chrome $5 once, GH zip | ~$5 |
| 4 | [discord-app.md](discord-app.md) | `/new` `/leaving` `/where` `/calendar` | this repo | one API route | Discord App Directory | $0 |
| 5 | [slack-app.md](slack-app.md) | same commands | this repo | one API route | shared app manifest → directory later | $0 |
| 6 | [mcp-server.md](mcp-server.md) | `npx -y galaxymovies-mcp` | `galaxymovies-mcp` | none (wraps public API) | npm + MCP registries | $0 |
| 7 | [trakt-lists.md](trakt-lists.md) | weekly public Trakt lists | this repo | one weekly cron | Trakt profile + Google | $0 |
| 8 | [wordpress-plugin.md](wordpress-plugin.md) | `[galaxy]` shortcode / block | `galaxy-movies-wp` | none (iframe embeds) | wordpress.org directory | $0 |
| 9 | [zapier-app.md](zapier-app.md) | trigger + action | `zapier/` | none | Zapier invite link → review | $0 |

## Build order

1. **where-api** — four other specs consume it.
2. **rss-feeds** — smallest diff, unlocks IFTTT/Zapier-without-code immediately.
3. **browser-extension**, **discord-app**, **mcp-server** — the real reach plays, parallel-safe.
4. **slack-app** — same shape as Discord, quick follow.
5. **trakt-lists** — independent cron.
6. **wordpress-plugin**, **zapier-app** — thin wrappers, lowest priority.

## Shared conventions the specs rely on

- **Attribution**: every public payload carries `"Powered by Galaxy Movies"` + a site URL (the `openapi.json` license). Specs preserve it.
- **Redis quota**: Upstash bills per command. Every new surface reads existing cached snapshots (`getProviderChanges`/`getMonthlyChanges` memoized, TMDB edge-cached via `fetchTmdb`, `setApiCache` + the entry.js s-maxage wrapper) — nothing adds per-request Redis fan-out. Rate limits only run on cache misses, matching `watchProviders.ts`.
- **Auth patterns**: cron → `isCronAuthorized`; webhooks → raw body + signature (polar.ts pattern); public feeds → CORS `*` + `checkDistributedRateLimit` + no `rejectBot`.
- **Cron wiring**: new crons need all three of `vercel.json` crons, `wrangler.jsonc` `triggers.crons`, and the path map in `scripts/opennext-postbuild.js`/`.open-next/entry.js`.
- **Not free, excluded**: ChatGPT GPT (needs the builder's Plus sub), Apple stores ($99/yr), Google Play ($25 — revisit later), X posting (already handled in `socialChannels.ts`).
