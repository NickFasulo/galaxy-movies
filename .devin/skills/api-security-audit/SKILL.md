---
name: api-security-audit
description: Sweep src/pages/api for the repo's route-security invariants — cron bearer auth, rate limits, bot rejection, webhook signatures, CORS scope, and edge-cache leaks. Use when asked to audit API security, review a new route's hardening, or before shipping a new endpoint.
---

# API security audit

Every route in `src/pages/api/` falls into one of six classes, each with its
own invariants. Classify first, then check. Several "exceptions" below are
deliberate and documented inline — don't flag or fix them.

## Classes and invariants

**Cron (`api/cron/*`)** — first statement is
`if (!isCronAuthorized(req)) return 401` (`src/lib/auth.ts`, bearer
`CRON_SECRET` + `timingSafeEqual`). The secret is the gate; no rate limit
needed. Heavy routes set `config.maxDuration`.

**Webhooks (`api/discord`, `api/slack`, `api/webhooks/*`)** — platform
signature on the RAW body before any parse:
`export const config = { api: { bodyParser: false } }` +
`verifyDiscordSignature` (Ed25519) / `verifySlackSignature` (HMAC, 5-min
replay window) / `x-telegram-bot-api-secret-token` via `safeEqual`. Rate
limit AFTER verification on a platform subject (guild_id, team_id, chat_id),
not client IP — platform egress IPs are shared.

**Account (`api/billing/*`, `api/trakt/*`, `api/alerts-*`, `api/share-link`,
`api/telegram/link`)** — `getLinkedEmail(req)` before any per-user read/write,
plus a TIGHT `*_rl` bucket (precedents: `billing_rl` 10/hr,
`billing_status_rl` 60/hr) — it's the only brute-force defense on the
synckey. NEVER `setApiCache`/`setSwrCache`/`s-maxage`: the entry.js edge
cache skips cookie/authorization requests but the synckey arrives via
query/body, so a cached response would leak across users.

**Public feeds (`api/streaming-changes`, `api/ext/where`, `api/rss/*`,
`api/reddit-payload`, `api/cal/*`)** — deliberately no `rejectBot`
(curl/feed-reader/Reddit-egress clients are the audience). Guard =
`checkDistributedRateLimit`/`checkPublicDigestLimit` + memoized reads only.
These are the only routes allowed `Access-Control-Allow-Origin: *`.

**Mail-link token routes (`api/waitlist-confirm`, `waitlist-remove`,
`alerts-link`, `alerts-watch-confirm`)** — no bot check or rate limit ON
PURPOSE: mail clients prefetch links and must not burn the token. The token
is the auth.

**Browser API (everything else)** — the standard stack, in order:
`requireMethod` → `rejectBot` →
`checkDistributedRateLimit(getClientIP(req), { keyPrefix: '<name>_rl' })`.
A route missing a piece needs an inline comment saying why (the
streaming-changes "No rejectBot here" comment is the precedent).

## Sweep

```bash
# cron routes missing the bearer check (expect no output)
grep -L isCronAuthorized src/pages/api/cron/*.ts

# routes with no rate limit / bearer / signature gate (expect only the documented exceptions)
grep -rL -e checkDistributedRateLimit -e checkPublicDigestLimit -e isCronAuthorized -e 'bodyParser: false' \
  src/pages/api --include='*.ts' --include='*.tsx'

# webhooks missing raw-body verification
grep -rL 'bodyParser: false' src/pages/api/discord src/pages/api/slack src/pages/api/webhooks

# cacheable per-user responses (expect no output)
for f in $(grep -rl getLinkedEmail src/pages/api); do grep -l -e setApiCache -e setSwrCache -e s-maxage "$f"; done

# CORS stars outside public feeds (expect no output)
grep -rn "Access-Control-Allow-Origin" src/pages/api
```

## Also check

- Client IP only via `getClientIP` — never read `x-forwarded-for`/`x-real-ip`
  directly (workerd trusts only `cf-connecting-ip`; the x-vercel header is
  client-spoofable there. See the comment in `lib/rateLimiter.ts`.)
- `requireMethod` before body/Redis work; `firstParam` on query values;
  whitelist inputs (provider keys, EMAIL_PATTERN/KEY_PATTERN) before lookups
- 429s set `Retry-After`; errors return status + generic message — no
  stack/`err.message` bodies to clients
- New routes: `rejectBot` unless a documented exception, their own `*_rl`
  keyPrefix (never reuse another route's bucket), unit test if state changes

## Output

Table of violations: route, class, missing invariant, severity (per-user
data leak > auth bypass > missing rate limit > convention). Report only —
several apparent violations are documented intent; don't fix unasked.
