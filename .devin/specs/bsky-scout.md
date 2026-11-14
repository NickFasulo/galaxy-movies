# Spec: Bluesky reply scout (`/api/cron/social-bsky-scout`)

Finds Bluesky conversations the streaming-changes data can genuinely answer, drafts replies, and emails them for manual posting — the `redditEngage.ts` draft loop applied to the platform where this brand's audience actually lives. Broadcast digests can't grow a 25-follower account; replies into existing conversations can. No auto-posting, ever — replies are conversational and an automated brand replying to humans is how accounts get blocked. The human sends every reply by hand.

## Cron route

- `GET /api/cron/social-bsky-scout` — `requireMethod GET` + `isCronAuthorized` (the standard cron pair).
- Schedule `0 16 * * 2,5` (Tue + Fri 16:00 UTC — conversations decay in days, so twice-weekly keeps drafts fresh; Friday sits 2h before `social-reddit-engage` so the two emails don't collide).
- Wire all three surfaces: `vercel.json` crons, `wrangler.jsonc` `triggers.crons`, and the path map in `scripts/opennext-postbuild.js` (see `.devin/skills/add-cron/`).
- Runs against **cached data only**: `getProviderChanges(BROADCAST_PROVIDERS)` — the same memoized snapshot the broadcasts read. No new Redis fan-out, no TMDB calls.

## Search

New module `src/features/social/bskyScout.ts`.

- Query `app.bsky.feed.searchPosts` on `https://public.api.bsky.app/xrpc/` — unauthenticated; fall back to an authed `bsky.social` session (the `createSession` flow already in `socialChannels.bsky`) only if the public endpoint 4xxs.
- Query set (each `sort=latest`, `lang=en`, `limit=25`, `since` = now−72h):
  - `"leaving netflix"`, `"leaving hulu"`, `"leaving max"` (plus `"leaving prime video"`, `"leaving disney"`)
  - `"what to watch"`, `"what should i watch"`
  - `"new on netflix"`, `"where to watch"`, `"where can i watch"`
- Candidate filters (drop a post if any fail):
  - `author.handle` ends with `galaxymovies.app` (our own posts)
  - `replyCount > 30` — thread is saturated, a reply adds nothing
  - any `labels[].val` in a blocklist (`porn`, `graphic-media`, `nudity`)
  - `uri` already in the Redis dedupe set
- Score = `likeCount + 3*replyCount`, take the top 5.

## Intent → reply drafting

Map post text to one intent and one provider, then draft a reply from the cached diff data. First matching rule wins.

- **Provider match** (case-insensitive): `netflix`→`netflix`, `hulu`→`hulu`, `hbo max|max`→`max`, `disney+?|disney plus`→`disney-plus`, `prime|amazon`→`amazon-prime-video`, `apple tv`→`apple-tv`. No match → provider = `null` (generic).
- **leaving intent** `/leav(e|ing)\b|last chance|going away/` → reply: `"Also leaving {label} this month: {t1} ({d1}), {t2} ({d2}) — full calendar: {leavingUrl}"` where titles come from `leavingSoon` sorted by date then popularity, `d` = `Nov 20` format (`digestDate` helper exists in `socialBroadcast.ts`), `leavingUrl` = `{SITE_URL}/leaving/{provider}` or `/leaving` when generic.
- **what-to-watch intent** `/what (to|should i) watch|recommend( me)?|something to watch/` → reply: `"New on {label} this week: {t1}, {t2}, {t3} — full list updated daily: {leavingUrl}"` from `added` (top 3 by list order).
- **where-to-watch intent** `/where (to|can i) watch/` → these are usually title-specific and we can't resolve a title without a lookup, so v1 **skips them** (collect candidates anyway and note `skipped: needs title lookup` in the email footer — if this intent dominates, a v2 can hit the where-api surface).
- No intent match → skip the post entirely.

Draft constraints: ≤300 chars (BSKY cap), plain community voice — no "we", no brand name in the text, the link does the attribution. Exactly one link per reply. If a drafted reply exceeds 300 chars, drop trailing titles until it fits; if the provider block has no useful titles for the intent, skip the candidate.

## Dedupe + state

- Redis SET `gm:social:bsky-scout:seen` (`SADD` each drafted post URI; members expire naturally via `EXPIRE` 14d — re-set TTL each run so the set doesn't outlive its relevance).
- `gm:social:bsky-scout:last` stores the last email body — same `lastPostKey`-style dedupe the broadcast uses so a run that surfaces the identical draft set emails nothing.
- Total Redis cost per run: ~4 commands. Matches the "cached-snapshot-only" convention.

## Email (the deliverable)

One Resend email per run with ≥1 drafted reply — `sendEmail` + `emailLayout` + `escapeHtml` from `lib/email`, to `REDDIT_ENGAGE_EMAIL || INDEXING_REPORT_EMAIL || fasulo.nick@gmail.com` (same fallback chain as `redditEngage.ts`).

- Subject: `BSKY reply drafts — {n} candidates`
- Per candidate: quoted post text (first ~200 chars), `@handle`, `♥ {likes} 💬 {replies}`, a one-tap post link `https://bsky.app/profile/{handle}/post/{rkey}` (`rkey` = last segment of the `at://` uri), then the drafted reply in a `<pre>` block for easy copy.
- Footer: run stats — `{searched} posts scanned, {skipped} filtered, {drafted} drafts`; `skipped: needs title lookup` count if any.
- No candidates → no email (same `text.length < 40`-style guard as the broadcasts).

## Files

- `src/features/social/bskyScout.ts` — search, filter, score, intent match, reply drafting, email send, dedupe.
- `src/features/social/bskyScout.test.ts` — fixtures of searchPosts responses.
- `src/pages/api/cron/social-bsky-scout.ts` — thin route.
- `vercel.json`, `wrangler.jsonc`, `scripts/opennext-postbuild.js` — cron wiring.

## Tests

- Provider matching: `max` doesn't match inside `maximum`, `disney` covers `disney+`/`disney plus`.
- Intent precedence: a post about "leaving" and "watch" resolves leaving first.
- Filters: own-author, saturated threads, labelled posts, seen-URIs.
- Reply drafting: fits 300 chars with long title lists; generic (no provider) replies link `/leaving`; empty `added`/`leavingSoon` skips.
- Email: no candidates → `skipped`, no send; identical draft set → `skipped already sent`.
- Post URL: `at://did:plc:x/app.bsky.feed.post/3abc` → `…/profile/{handle}/post/3abc`.

## Verify

- `npm test`, `npm run typecheck`, `npm run lint`.
- Local: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/social-bsky-scout` → JSON `{drafted, skipped}`; check the Resend email lands with quoted posts + `<pre>` replies + working bsky.app links.
- `npm run smoke:workerd` — the search fetch is plain `fetch`, workerd-safe.
- After one live run: Redis `SMEMBERS gm:social:bsky-scout:seen` non-empty; no other new keys.

## Out of scope (note for later)

- Hashtags on the broadcast digest (#FilmSky etc.) — separate one-line change to `buildBroadcastPost`, cheap win, don't bundle it here.
- Auto-posting replies — deliberately never; a `post` mode for this would get the account blocked.
- Title-lookup replies (where-api intent) — v2 candidate once `where-api` ships.
