---
name: env-setup
description: Add a new environment variable correctly across env.d.ts typing, .env.local, worker secrets, and dual GitHub secret scopes — including the Dependabot and e2e gotchas. Use when adding an env var, wiring a new API key, or debugging a missing secret in CI/e2e/workerd.
---

# Adding an environment variable

A new env var has up to five homes. Missing any one produces a confusing
failure (typecheck passes, CI fails; dev works, workerd 503s).

## Checklist

1. **Typing** — declare in `src/types/env.d.ts` (`NEXT_PUBLIC_` vars are
   client-visible; everything else is server-only).
2. **`.env.local`** — local dev value. If there's a `.env.example`, mirror
   the key there (documented value/placeholder, never a real secret).
3. **Worker secrets** — `npm run cf:secrets` (=
   `scripts/sync-cf-secrets.js` + `wrangler secret bulk`). The script
   auto-drops `NEXT_PUBLIC_*` (inlined at build by OpenNext) and
   `CLOUDFLARE_API_TOKEN` (it's wrangler's own auth). If the var is
   build-time-only, that's fine — runtime code still needs it pushed.
4. **GitHub secrets — BOTH scopes**: CI resolves secrets from the Actions
   store on normal runs but the **Dependabot secret store** on Dependabot
   runs. A secret needed by CI (e.g. `TMDB_API_KEY`, `WATCHMODE_API_KEY`
   for `smoke:workerd`) must exist in `gh secret list` AND
   `gh secret list --app dependabot`, or every Dependabot PR fails CI.
5. **e2e emptying** — `test:e2e` boots `next dev` on :3100 with
   spend-capable vars emptied (OpenAI/Upstash/Resend/Watchmode/Umami) so
   nothing can spend or write. If the new var can spend money or write to a
   backend, add it to that empty-list in `playwright.config.ts`/the e2e
   setup — don't rely on the spec to avoid calling it.

## Rules of thumb

- Feature-gate on absence: endpoints return 503 when their envs are missing
  (the Polar/Trakt pattern), components no-op or degrade — never crash on a
  missing optional var.
- Secret rotation: rotating a value means updating every home it lives in —
  `.env.local`, worker secret, both GH scopes where applicable.
- Never commit real values; `.env.local` and `.secrets*.json` are
  gitignored — keep them that way.
- When adding to AGENTS.md's Environment section, document the failure mode
  (what breaks when unset), not just the name.
