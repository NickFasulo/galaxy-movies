---
name: deploy-verify
description: Post-deploy verification for the Cloudflare Workers production deploy — smoke, edge-cache headers, workerd error tail, and the rollback decision tree. Use after cf:deploy, when asked to verify a deploy, or when production looks broken.
---

# Deploy verification

Production is Cloudflare Workers (`npm run cf:deploy` → galaxymovies.app +
www custom domains + `galaxy-movies.winter-rice-c91a.workers.dev`). Vercel is
cold standby. Verify in this order.

## 1. Smoke (2 min)

```bash
npm run smoke                 # full probe against prod
SMOKE_BASE=https://galaxy-movies.winter-rice-c91a.workers.dev npm run smoke
```

The second run matters: it bypasses the zone WAF managed-challenges, so a
failure there vs. on the custom domain separates app breakage from WAF
config.

## 2. Edge-cache + HTML sanity

```bash
curl -sI https://www.galaxymovies.app/leaving/netflix | grep -i 'x-edge-cache\|cache-control'
```

First hit = `x-edge-cache: miss`, second = `hit` (the entry.js caches.default
wrapper on `s-maxage` responses). A page that never caches on repeat means
the wrapper skipped it — check for `Set-Cookie`/`private`/`no-store`.

## 3. Worker errors

```bash
npx wrangler tail galaxy-movies --format pretty
```

Watch a minute of live traffic for exceptions. workrd-only bugs (the three
render traps) produce server 500s that curl-smoke misses — that's why
`smoke:workerd` runs in CI; if it passed but prod errors, suspect a
runtime-only path (cron, webhook).

## 4. Rollback decision tree

- **This deploy is bad** → `npx wrangler rollback` (previous worker
  version, instant).
- **Worker platform is bad** → DNS flip to Vercel standby: re-add
  `A galaxymovies.app → 216.198.79.1` + `CNAME www →
  2144276a1a31ddeb.vercel-dns-017.com` in Cloudflare DNS, re-enable Vercel
  crons. Full procedure in AGENTS.md's Deploys section.
- **One page type broken** → usually a data/redis issue, not the deploy —
  check the relevant snapshot keys before rolling back.

## Notes

- Crons don't need the custom domain to fire — `triggers.crons` +
  `WORKER_SELF_REFERENCE` handle it; a failed cron shows in tail/logs, not
  smoke.
- Post-deploy is also when a *new* provider's first diff run can be checked
  (`changes:{catalog,diff}:{key}` in Redis) — see `add-provider`.
