---
name: bot-activity
description: Check crawler and bot traffic against the site — live rate-limit state, AI crawler family budgets, tail traffic, and drift between the code's crawler lists and dashboard WAF rules. Use when asked to check bot activity, see what crawlers are hitting the site, investigate scraping, or review AI-bot access.
---

# Bot activity

Three vantage points: Redis rate-limit state (right-now snapshot), worker
tail (live requests), and the Cloudflare dashboard (edge/WAF, not in repo).
Start with the cheapest.

## 1. Rate-limit snapshot

```bash
node scripts/bot-activity.js            # top 25 hot buckets
node scripts/bot-activity.js --family   # only the AI crawler budgets
node scripts/bot-activity.js --all      # everything
```

Reads `global_rl:*` and `*_rl:*` buckets. Two kinds of `global_rl:` key:
`global_rl:ai_*` are the `CRAWLER_BUDGETS` families in
`src/lib/crawlerThrottle.ts` (claude, openai, perplexity, amazon, exa;
600/hr shared cap each), and the rest (`watchmode`, `price`, `allmovies`,
…) are upstream-spend caps — a `watchmode`/`price` bucket pinned at its cap
means abuse is pressing a PAID API, higher priority than a tripped crawler
budget. `*_rl:*` keys are per-subject route buckets. All keys are
window-scoped — a hot bucket is a client burning against a cap right now,
not history.

## 2. Live traffic

```bash
npx wrangler tail galaxy-movies --format pretty
```

Watch a minute of traffic. Read it by status:

- `403` on API routes = `rejectBot`/`isBot` firing — check the UA; new
  scraper UAs are candidates for `BOT_PATTERNS` in `lib/rateLimiter.ts`
- `429` = per-IP/per-subject bucket tripped — correlate with the script above
- Googlebot/Bingbot hitting `/api/*` (not `/api/og`) is worth a look —
  robots.txt disallows `/api/` and search engines should be on pages
- Note: tail shows only what reaches the worker. WAF-challenged traffic
  never appears here — silence ≠ no bots.

## 3. Cloudflare dashboard (manual, not scriptable from repo)

Zone Security Level is `medium` — datacenter IPs get managed-challenged
before the worker. Check **Security → Events** for challenge/block volume
and top UAs/ASNs, and **Bots** if Bot Fight Mode data exists. The
dashboard-only skip rule exempts `/api/`, `/embed`, `/.well-known/`,
`llms.txt`, `openapi.json`, `robots.txt`, `ads.txt`, `favicon.ico` — a
legit programmatic client getting challenged usually means its path isn't
in that list.

## Cross-references

- **robots.txt drift**: `public/robots.txt` disallows training crawlers
  (ClaudeBot, GPTBot, CCBot, meta-externalagent, …). UAs observed in tail
  fetching disallowed paths are ignoring robots — spoofers or scrapers;
  the named ones should 403 at the edge or never appear.
- **WAF exemption drift**: `CRAWLER_BUDGETS` UA families must stay in sync
  with the dashboard managed-challenge exemption list (see the comment in
  `crawlerThrottle.ts`). A family in code but not exempted gets challenged
  at the edge — symptom is zero hits for that family plus WAF events.
- **AI interest**: `llms.txt`/`openapi.json` hits + `ai_*` budget usage =
  which assistant crawlers actually read the site. Compare against Umami
  referrers to see if any send traffic (perplexity.ai, chat.openai.com).
- **Umami** = human baseline only; the tracker filters most bots, so
  bot-looking traffic there is notable.

## Output

Summarize: which AI families are consuming budget, top hot buckets by
keyPrefix (which route's cap is being pressed), any new/scraper UAs worth
adding to `BOT_PATTERNS` or robots.txt, and any code-vs-dashboard drift.
Flag when a legit bot is being blocked (SEO-relevant crawlers) vs. a
blocked bot being bypassed.
