---
name: auth-flow-review
description: Review changes touching the synckey auth model, Trakt PKCE OAuth, and platform webhook verification — billing, alerts, trakt, telegram, discord, slack surfaces. Use when editing auth-adjacent code, adding a webhook, or reviewing code that touches billing.ts, trakt.ts, or api/webhooks.
---

# Auth flow review

There is no account system: the email+synckey pair minted on alerts
confirmation (`SYNCKEY_KEY` hash in Redis) is the login for every
authenticated endpoint. Review changes against this model.

## Synckey invariants

- `getLinkedEmail` (`src/features/billing/billing.ts`) is the ONLY credential
  check: EMAIL_PATTERN + KEY_PATTERN shape validation, then `safeEqual`
  against the stored hash. Don't hand-roll alternatives or skip the compare.
- No per-user read/write runs before `getLinkedEmail` returns an email.
- Rate limits are the brute-force defense on the synckey — authed routes keep
  tight `*_rl` buckets (precedents: `billing_rl` 10/hr, `billing_status_rl`
  60/hr). A new authed route without one is a finding.
- Outbound links carry the key in the FRAGMENT (`plusLink`, `manageLink`) —
  `#key=` never hits server logs or third-party referers. Moving it to a
  query param on an emailed/externally-visible URL is a finding. (API calls
  pass email+key in query/body to our own routes — that's the model.)
- Authed responses must never emit `s-maxage`/`setApiCache`/`setSwrCache`:
  the `.open-next/entry.js` edge cache skips cookie/authorization *requests*,
  but the synckey rides query/body — it can't distinguish an authed response
  and WOULD cache it for the next visitor.
- Unsubscribe/manage link tokens (`waitlist-remove`, `alerts-link` style) are
  bearer tokens in the URL — single-purpose, long-random, and the routes
  deliberately skip rate limits because mail clients prefetch. Shortening,
  predictabling, or logging them is a finding.

## Trakt OAuth (`src/features/billing/trakt.ts`)

- PKCE-only app — there is NO client secret to sign with. `state` is a random
  nonce backed by Redis (`gm:alerts:trakt:pkce:*`, 600s TTL) and
  `consumePkceSession` GETs then DELs it: single-use. Don't reintroduce
  HMAC-signed state or pass the verifier in a URL.
- Disconnect must `revokeAccessToken` before `hdel` — forgetting the refresh
  token alone leaves the grant alive on Trakt and re-connect silently
  auto-approves.
- A denied refresh in `traktAccessToken` deletes the stored link and returns
  `not_connected` — the grant is dead; that's intended, not an error path to
  "fix".
- Tokens live in the `TRAKT_KEY` hash only — never log them, never echo them
  to the client.

## Webhooks

Every platform verifies on the RAW body (`bodyParser: false`) before parse:

- Discord: `verifyDiscordSignature` — Ed25519 over `x-signature-ed25519` + timestamp
- Slack: `verifySlackSignature` — HMAC v0 over `x-slack-signature` + timestamp,
  with a 5-minute freshness window for replay blocking (preserve it if modified)
- Telegram: `x-telegram-bot-api-secret-token` vs `TELEGRAM_WEBHOOK_SECRET` via
  `safeEqual`; chat linking uses single-use `tglink:` Redis tokens
- Polar: no inbound webhook — checkout is created server-side; `recover.ts`
  tokens follow the same single-use/short-TTL expectation as `tglink:`

Rate-limit AFTER verification on a platform subject (guild_id, team_id,
chat_id) — platform egress IPs are shared, so per-IP limits either starve
legit installs or spare abusers.

## Output

Per finding: file:line, the invariant broken, and the concrete exploit
(synckey brute-force, cross-user cached response, replayed webhook, orphaned
Trakt grant, token in logs). Cross-reference `api-security-audit` for the
route-level stack when a route file is involved.
