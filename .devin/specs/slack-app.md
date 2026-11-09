# Spec: Slack app (`/new`, `/leaving`, `/where` slash commands)

Slash-commands-only Slack app other workspaces install via a shared app manifest. One endpoint, HMAC-verified, same data as the Discord app. Free; App Directory listing is optional and later.

## Endpoint

`POST /api/slack/commands` in `src/pages/api/slack/commands.ts`.

Slack signs `x-www-form-urlencoded` bodies — raw body required, same transport pattern as `polar.ts` / the Discord endpoint:

```ts
export const config = { api: { bodyParser: false } }
```

Verification (before any work — it's the abuse guard):

- `X-Slack-Request-Timestamp` within 5 min (replay window).
- Base string `v0:{timestamp}:{rawBody}`, HMAC-SHA256 with `SLACK_SIGNING_SECRET`, compare hex to `X-Slack-Signature` (`v0=...`) using `safeEqual` (`src/lib/auth.ts`) on the digests.
- `crypto.subtle` HMAC — the SHA-1 HMAC impl in `src/features/social/socialChannels.ts` (X OAuth) generalizes: extract a `hmacShaBase64(key, data, 'SHA-256')` helper or write the 5 lines inline.
- Then parse `new URLSearchParams(rawBody)` → `command`, `text`, `team_id`, `channel_id`, `response_url`, `trigger_id`.

## Commands

| Command | Text arg | Response |
|---|---|---|
| `/new` | optional provider | top `added` items, ephemeral-by-default (`response_type: "ephemeral"`) |
| `/leaving` | provider (required-ish; no arg → usage reply listing keys) | `left` + `leavingSoon` with dates |
| `/where` | title query | `resolveWhere()` in-process (where-api.md) → providers by category |
| `/calendar` | provider | ICS URL `https://galaxymovies.app/api/cal/{provider}` |

- Ack inside 3s: Redis-backed `getProviderChanges` responds in ms, so answer synchronously with `{ response_type: "ephemeral", blocks: [...] }`. `/where` does TMDB lookups — return an immediate `{text: "Looking that up…"}` then POST the real answer to `response_url` (works for 30 min after the command, no bot token needed).
- Format: Block Kit `section` with `mrkdwn` lines `*Title* (year) — <{url}|date>`; a `context` block `Powered by Galaxy Movies • updated daily`. Cap 10 items.
- Provider arg validated against `embeddableProviders()`; unknown → usage text listing valid keys.

## Rate limiting

Key on `team_id` (Slack's workspace id) not IP — `slack_rl`, 240/hr per team, after signature verification.

## App manifest (for distribution)

Anyone can create the app from this manifest in their workspace — that's the v1 distribution mechanism (no OAuth install flow needed for slash-commands-only apps). Include the YAML in the spec doc/README:

```yaml
display_information:
  name: Galaxy Movies
  description: What's new and leaving your streaming services
  background_color: "#14181c"
features:
  slash_commands:
    - command: /new
      url: https://galaxymovies.app/api/slack/commands
      description: Top streaming arrivals this week
      should_escape: false
    - command: /leaving
      url: https://galaxymovies.app/api/slack/commands
      description: What's leaving a streaming service
    - command: /where
      url: https://galaxymovies.app/api/slack/commands
      description: Where is a title streaming?
    - command: /calendar
      url: https://galaxymovies.app/api/slack/commands
      description: Link to the ICS feed for a service
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

Later (out of scope v1): App Directory listing needs OAuth install + a bot token + review; weekly-digest subscriptions per channel need `chat:write` scope. Slash commands alone still ship value.

## Env

`SLACK_SIGNING_SECRET` — worker secret (`npm run cf:secrets`). Missing → 503.

## Files

- `src/pages/api/slack/commands.ts`
- `src/features/social/slackCommands.ts` — verify + parse + block building (pure, testable).
- `src/features/social/slackCommands.test.ts` — fixtures: valid/invalid signature vectors, each command, unknown provider.

## Verify

- `npm test`, `npm run typecheck`.
- Local: create the app from the manifest in a test workspace, point command URLs at a `cloudflared` tunnel to `wrangler dev`.
- Bad signature → 401; expired timestamp → 401; `/new netflix` → ephemeral blocks; `/where fight club` → delayed response_url post.
- e2e: spec asserting unsigned POST 401s.
