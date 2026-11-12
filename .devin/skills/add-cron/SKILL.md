---
name: add-cron
description: Wire a new scheduled job correctly across all three config surfaces (vercel.json, wrangler.jsonc, opennext-postbuild.js) with isCronAuthorized auth and workerd verification. Use when adding a cron, scheduling a job, or debugging why a scheduled route never fires.
---

# Adding a cron job

A cron that misses any of the three config surfaces deploys cleanly and then
silently never runs — that's the failure this checklist exists for.

## Wiring checklist (all three required)

1. **Route**: `src/pages/api/cron/<name>.ts` — first line of the handler is
   the auth gate:

   ```ts
   if (!isCronAuthorized(req)) return res.status(401).end()
   ```

   (`isCronAuthorized` in `src/lib/auth.ts` — Bearer `CRON_SECRET`,
   timing-safe compare.) Keep it fetch-only (no TCP clients) for workerd.
2. **`vercel.json`** — add `{ "path": "/api/cron/<name>", "schedule": "<cron>" }`
   to the `crons` array. Vercel crons are disabled, but this stays the
   canonical schedule record and documents intent.
3. **`wrangler.jsonc`** — add the schedule string to `triggers.crons`
   (this is what actually fires the worker's `scheduled()` handler).
4. **`scripts/opennext-postbuild.js`** — add `'<cron>': '/api/cron/<name>'`
   to the schedule→path map; it generates `.open-next/entry.js`, which
   invokes the route through the `WORKER_SELF_REFERENCE` binding with the
   `Bearer CRON_SECRET` header.

Keep schedules UTC and stagger new jobs away from the existing cluster
(6:00–7:00, 13:30–17:00 blocks are already dense).

## Verify before deploy

```bash
npm run cf:build
npm run cf:preview -- --test-scheduled
# then hit: http://localhost:8787/__scheduled?cron=<your cron expr>
```

The `scheduled()` handler should log the dispatch; a missing map entry shows
as an unhandled schedule. Then `npm run smoke:workerd` for good measure.

## Gotchas

- **External schedulers** (Make/Zapier calling the route): they get 403'd by
  the zone WAF managed-challenge on the custom domain — point them at
  `galaxy-movies.winter-rice-c91a.workers.dev` instead. Don't create a WAF
  exemption.
- **Quota-aware crons** (Watchmode): stand down at ≥99% quota — see the
  `watchmodeQuota.ts` pattern before adding Watchmode calls to a new cron.
- **Redis budget**: crons aren't per-request paths, but stay mindful — batch
  writes, don't fan out per-key.
