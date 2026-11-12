---
name: spec-runner
description: Implement one of the .devin/specs/ distribution specs end-to-end with the shared conventions (cached-data-only Redis reads, attribution payloads, auth patterns, cron wiring) and verification. Use when asked to build a spec from .devin/specs/, pick up the next distribution surface, or implement RSS/Discord/MCP/extension-style work.
---

# Spec runner — distribution surfaces

`.devin/specs/` holds implementation-ready specs for free distribution
channels — each file is standalone and meant to be handed to an agent. The
README there has the build order; this skill is the execution wrapper.

## First: check what's already built

The repo moves fast — verify before building. As of this writing:

- **Built**: `where-api` (`src/pages/api/ext/where.ts` +
  `src/features/catalog/whereLookup.ts`), `rss-feeds`
  (`src/pages/api/rss/[provider].ts`), Discord/Slack command handlers
  (`src/features/social/discordCommands.ts`, `slackCommands.ts` — check the
  spec for which pieces landed), `trakt-lists`
  (`src/pages/api/cron/trakt-lists.ts` + `src/features/social/traktLists.ts`).
- **External repos** (not this codebase): browser-extension, mcp-server
  (`galaxymovies-mcp`), wordpress-plugin (`galaxy-movies-wp`), zapier-app
  (`zapier/`). These build against the public APIs — same spec, different
  repo; ask where the repo lives before starting.

## Conventions every spec shares (from the spec README)

- **Attribution**: every public payload carries `"Powered by Galaxy Movies"`
  + a site URL. Specs preserve it — it's the backlink.
- **Redis quota**: Upstash bills per command. New surfaces read existing
  cached snapshots (`getProviderChanges`/`getMonthlyChanges`, `fetchTmdb`'s
  edge cache, `setApiCache` + the entry.js s-maxage wrapper). No per-request
  Redis fan-out; rate limits only run on cache misses (`watchProviders.ts`
  pattern).
- **Auth**: cron → `isCronAuthorized` (`src/lib/auth.ts`, Bearer
  `CRON_SECRET`); webhooks → raw body + signature (`polar.ts` pattern);
  public feeds → CORS `*` + `checkDistributedRateLimit`, no `rejectBot`.
- **Cron wiring**: new crons need ALL THREE of `vercel.json` crons,
  `wrangler.jsonc` `triggers.crons`, and the schedule→path map in
  `scripts/opennext-postbuild.js` (see `add-cron` skill).

## Execution

1. Read the spec file fully; list its deliverables and dependencies (e.g.
   extension/mcp/discord all consume `where-api`).
2. Follow repo conventions: strict TS under `src/`, thin `src/pages/` routes
   calling into `src/features/`/`src/lib/`, colocated `*.test.ts` for logic.
3. Keep routes fetch-only (no TCP — Upstash REST, not clients) for workerd.

## Verification

- `npm test` + `npm run typecheck` + `npm run lint` (pre-commit runs all
  three anyway).
- `npm run check` (build) — and `npm run smoke:workerd` for anything that
  ships an API route, since workerd-only breakage is the deploy killer.
- `npm run test:e2e` when the spec adds a user-facing page.
- After merge/deploy: hit the live endpoint once against prod to confirm
  the wiring (crons especially — a missed map entry fails silently).
