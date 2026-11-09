# Spec: Discord installable app (`/new`, `/leaving`, `/where`, `/calendar`)

An installable Discord application other servers add — slash commands powered by one HTTP interactions endpoint on the worker. No gateway process, no hosting cost, free App Directory listing.

## Endpoint

`POST /api/discord/interactions` in `src/pages/api/discord/interactions.ts`.

Discord Ed25519 verification needs the **raw** body — copy the transport pattern from `src/pages/api/webhooks/polar.ts`:

```ts
export const config = { api: { bodyParser: false } }
// + readRawBody(req) helper (verbatim from polar.ts)
```

Verify before any work — the signature check *is* the abuse guard:

- Headers `X-Signature-Ed25519` (hex) + `X-Signature-Timestamp`; signed payload = `timestamp + rawBody`.
- `crypto.subtle.verify('Ed25519', key, sig, data)` — supported on Node ≥20 and workerd (the deploy target). Import `DISCORD_APP_PUBLIC_KEY` hex → raw key. If the runtime lacks Ed25519, fail closed with a logged error; do not skip verification.
- Bad signature → `401`. Missing env → `503`.

## Interaction handling

| Type | Action |
|---|---|
| PING (1) | `{ type: 1 }` — required for endpoint validation at discord.dev |
| `new` | deferred (5) → followup |
| `leaving` | deferred (5) → followup |
| `where` | deferred (5) → followup (TMDB calls) |
| `calendar` | immediate (4), ephemeral ok — just returns the ICS URL |

Always defer (5) rather than racing the 3s ack — cold starts + Redis reads are usually fast but Discord gives no grace. Followup: `PATCH https://discord.com/api/v10/webhooks/{DISCORD_APP_ID}/{interaction.token}/messages/@original` — authorized by the interaction token, **no bot token needed at runtime**.

## Commands

Register once via `scripts/discord-register.js` → `PUT /applications/{DISCORD_APP_ID}/commands` (needs `DISCORD_BOT_TOKEN`):

```
/new      provider?  — top arrivals this week (option: provider key, autocomplete list)
/leaving  provider   — recent + scheduled departures (required option)
/where    query      — resolve via resolveWhere() → providers by category
/calendar provider   — link to the public ICS feed /api/cal/{provider}
```

- Provider options built from `embeddableProviders()`; validate inputs against the same allowlist.
- `/new` without provider: merge all providers' `added`, take top 10 by `popularity`.
- `/where` calls `resolveWhere()` in-process (`src/features/catalog/whereLookup.ts` — see where-api.md; no HTTP self-call).

## Response format

Discord embeds, capped at 10 items per section:

- `title`: "New on Netflix this week" / "Fight Club — where to watch (US)"
- `description`: one line per title, `**Title** (year) — date` linked to `https://galaxymovies.app/{movies|tv}/{id}` (Discord renders markdown links in embed descriptions).
- `color`: brand accent int (from `src/theme.ts` brand token).
- `footer`: `Powered by Galaxy Movies • updated daily`.
- Empty result → friendly ephemeral text + link to `/streaming/{provider}`.
- Discord's 2000-char cap on messages doesn't apply to embeds (6000 total); still keep sections ≤10 items.

## Rate limiting

Discord edge IPs are shared — don't use the strict per-IP buckets. `checkDistributedRateLimit` keyed on `guild_id` from the interaction payload (`discord_rl`, 240/hr per guild) after signature verification; fall back to `interaction.channel_id` in DMs. Unsigned/bad-signature traffic short-circuits at 401 before Redis.

## Env + setup

| Var | Where | Purpose |
|---|---|---|
| `DISCORD_APP_PUBLIC_KEY` | worker secret | signature verify (runtime) |
| `DISCORD_APP_ID` | env | followup webhook path (runtime) |
| `DISCORD_BOT_TOKEN` | local only | `scripts/discord-register.js` |

Steps: create app at discord.dev → copy public key + app id → set Interactions Endpoint URL to `https://galaxymovies.app/api/discord/interactions` (Discord sends a PING; must verify first) → `node scripts/discord-register.js` → test in own server → submit to App Directory.

Directory listing needs: privacy policy (`/privacy` exists), terms (`/terms` exists), a support server invite, tags (movies, tv, entertainment). Verification (>100 servers) is free, later.

## Files

- `src/pages/api/discord/interactions.ts`
- `src/features/social/discordCommands.ts` — command routing + embed building (testable without HTTP).
- `src/features/social/discordCommands.test.ts` — fixture payloads: ping, bad sig, /new, /leaving unknown provider, /where miss.
- `scripts/discord-register.js` — plain JS, env-driven.

## Verify

- `npm test`, `npm run typecheck`.
- PING fixture → PONG; forged signature → 401.
- Set endpoint on a dev tunnel (`cloudflared tunnel`), create test guild, run each command against `wrangler dev` build (`npm run smoke:workerd` covers boot; manual curl for the route).
- e2e: spec asserting the endpoint 401s unsigned POSTs — no real Discord needed.
