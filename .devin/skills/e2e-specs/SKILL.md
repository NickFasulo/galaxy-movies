---
name: e2e-specs
description: Write Playwright e2e specs that follow repo conventions — fixtures.ts error assertion, stable content ids, API stubbing, and the dev vs workerd run modes. Use when adding an e2e test, covering a new page, or fixing a flaky spec.
---

# Writing e2e specs

Specs live in `e2e/*.spec.ts` (Chromium). They exist to catch the bugs curl
can't see — hydration crashes, workerd render traps, client-side wiring.

## Non-negotiable conventions

1. **Import `test`/`expect` from `e2e/fixtures.ts`**, never from
   `@playwright/test` — the fixture's teardown asserts zero uncaught
   `pageerror`s, which is the whole point (hydration crashes fail even when
   the test only checks SSR content).
2. **Assert stable ids and structure, never volatile data.** Fight Club
   `/movies/550`, GoT `/tv/1399` are the canonical fixtures; never assert on
   trending rows or today's diffs.
3. **Never hit real backends.** Account flows seed creds via
   `addInitScript` (`gm.alerts.v1` localStorage) and stub `/api/*` with
   `page.route` through `e2e/helpers.ts` `stubAccountApi` — waitlist/alert
   POSTs write Redis + send real email. Trakt OAuth and Polar checkout stay
   out of e2e; their server logic is unit-tested in `features/billing/`.
4. **`notFound` renders Next's built-in 404 under workerd**, not
   `pages/404.tsx` — assert status + generic not-found copy, not our
   branded copy.
5. **New spend-capable env vars** must be added to the e2e empty-list (see
   `env-setup`) — the suite's safety model is "nothing can spend or write".

## Running

```bash
npm run test:e2e            # boots next dev :3100 (webpack), spend vars emptied
npm run test:e2e:ui         # Playwright UI for debugging
npm run test:e2e:workerd    # boots last cf:build under wrangler dev :8789 — THE suite that catches workerd traps
E2E_BASE_URL=<url> npm run test:e2e   # any running target (workers.dev ok; never prod's custom domain — WAF challenges datacenter traffic)
```

One-time setup: `npx playwright install chromium`.
`test:e2e:workerd` needs `TMDB_API_KEY` in env (wrangler doesn't read
`.env.local`).

## When a spec is flaky

- Prefer `getByRole`/stable selectors over CSS classes.
- SSR content is there at `load`; client hydration needs `expect(...).toBeVisible()`
  with auto-retry — don't `waitForTimeout` fixed ms.
- A spec failing only under `test:e2e:workerd` is a render trap — see
  `workerd-debug`.
