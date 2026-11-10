# Galaxy Movies

**Galaxy Movies** is an ultra-fast, mobile-friendly discovery platform for film and TV streaming availability. Track what's coming to and leaving every major streaming service, find where anything is streaming right now, get alerted when something you care about arrives, and ask an AI assistant what to watch next.

Live at [galaxymovies.app](https://galaxymovies.app).

---

## ✨ Features

* **⚡ Instant Search & Discovery:** Browse thousands of trending movies and shows, explore cast, studio, and network pages, and move between views with sub-100ms transitions.


* **📺 Where to Watch:** Check exact streaming, rental, and purchase availability for any title across regions (US + India).


* **📈 Streaming Changes:** Daily-tracked provider diffs power "new on" and "leaving" pages, monthly arrivals-vs-departures verdicts (`/this-month/[provider]`), churn data studies (`/reports/streaming-churn`), and an open JSON feed at `/api/streaming-changes`.


* **📋 Lists & Collections:** Editorial picks organized by mood, genre, and theme (`/lists/`, `/collections/`), plus `*-alternative` guides for people comparing streaming trackers.


* **🔔 Alerts:** Email and web-push notifications when a specific title lands on a service, a weekly digest of everything coming/leaving, weekly price-drop alerts on tracked titles, and an ICS calendar feed. Optional Telegram bot.


* **📣 Social Broadcasts:** Daily streaming-change posts across Bluesky, Mastodon, X, Reddit, Tumblr, Pinterest, Facebook, Discord, and Telegram, plus an auto-generated video cross-posted to TikTok, YouTube Shorts, and IG Reels.


* **📖 AI Synopses:** Get quick, objective film summaries generated via the OpenAI API before deciding what to watch.


* **🤖 Galaxy Bot:** A conversational AI movie assistant designed to eliminate choice paralysis by providing tailored recommendations based on mood, group preferences, time limits, and real-time streaming availability.


* **⭐ Galaxy Plus:** Paid subscription (Polar billing) with personalized recommendation digests, Trakt sync, and an ad-free experience.


* **🧩 Embeds & More:** Iframe widgets (`/embed/[provider]`) third-party sites can drop in for daily streaming-change lists, curated lists and collections, plus a trivia game.


* **🌌 Dynamic OG Cards:** Generates high-resolution social share cards dynamically using `next/og` (`/api/og`, `/api/og-leaving`).


---

## 🛠️ Tech Stack & Architecture

* **Framework:** [Next.js](https://nextjs.org/) 16 (Pages Router) + React 19, strict TypeScript

* **Styling:** [Chakra UI](https://chakra-ui.com/) v3 + Framer Motion

* **State & Caching:** [TanStack React Query](https://tanstack.com/query) v5; [Upstash Redis](https://upstash.com/) (REST) for server-side state

* **AI:** [OpenAI API](https://openai.com/) — chat assistant, synopses, generated list intros

* **Data:** [TMDB API](https://www.themoviedb.org/documentation/api) + [Watchmode API](https://api.watchmode.com/) for streaming availability

* **Billing:** [Polar](https://polar.sh/) subscriptions + webhooks

* **Email & Push:** [Resend](https://resend.com/), web-push (VAPID)

* **Infra:** [Cloudflare Workers](https://workers.cloudflare.com/) via [@opennextjs/cloudflare](https://opennext.js.org/cloudflare) in production; Vercel kept as cold standby

* **Quality:** [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/) e2e, ESLint flat config, [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) budgets

* **Analytics:** Umami + Google Search Console indexing reports

---

## 🚀 Development

```bash
npm install            # installs deps + applies patch-package patches
npm run dev            # dev server on :3000 (webpack)
npm run typecheck      # tsc --noEmit (TypeScript 7 native)
npm test               # Vitest unit tests
npm run test:coverage  # tests + v8 coverage floor
npm run lint           # ESLint
npm run check          # typecheck + production build
npm run test:e2e       # Playwright e2e (needs `npx playwright install chromium` once)
npm run test:e2e:workerd  # e2e against the last cf:build output under wrangler dev
npm run index:check    # GSC indexing status for upcoming releases
npm run lhci           # build + Lighthouse CI budgets
```

`npm run dev:turbo` runs Turbopack but currently hits a Next.js Pages Router dev bug — keep `dev` on webpack.

A husky `pre-commit` hook runs typecheck + lint + tests.

### Environment

Create `.env.local` and fill in what you need. `TMDB_API_KEY` is the only hard requirement for browsing; the rest gate specific features:

| Variable | Feature |
| --- | --- |
| `TMDB_API_KEY` | Catalog data (required) |
| `OPENAI_API_KEY` | AI synopses, reviews, Galaxy Bot |
| `WATCHMODE_API_KEY` | Streaming availability / prices |
| `UPSTASH_REDIS_KV_REST_API_URL` + `_TOKEN` | Caching, rate limits, alerts storage |
| `RESEND_API_KEY` / `RESEND_FROM` | Email alerts + digests |
| `POLAR_*` | Plus subscriptions |
| `TRAKT_CLIENT_ID` | Plus Trakt sync |
| `NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY` / `WEBPUSH_PRIVATE_KEY` | Push notifications |
| `CRON_SECRET` | Authenticates `/api/cron/*` |
| `GSC_CLIENT_EMAIL` / `GSC_PRIVATE_KEY` | Search Console indexing checks + weekly report |
| `BING_WEBMASTER_API_KEY` | Bing URL submissions |
| `NEXT_PUBLIC_UMAMI_*` | Analytics |
| `TAKEADS_*` / `NEXT_PUBLIC_AMAZON_IN_TAG` | Affiliate monetization |

Social-channel keys (`BSKY_*`, `TELEGRAM_*`, `X_*`, `MASTODON_*`, `REDDIT_*`, `TUMBLR_*`, `PINTEREST_*`, `FB_*`, `SOCIAL_*_WEBHOOK`) each gate an optional broadcast channel. `TIKTOK_*`, `YT_*`, and `IG_*` credentials are only used by the GitHub Actions video pipeline, not the app runtime.

## 📁 Structure

* `src/pages/` — routes (Pages Router); API routes stay thin and call into features
* `src/features/{catalog,alerts,billing,ai,social,game,monetize,indexing}/` — domain modules
* `src/lib/` — cross-cutting infra (redis, auth, rate limiting, email)
* `src/hooks/` — app-wide hooks
* `src/types/` — shared TMDB/API + env declarations
* `src/components/` — shared UI
* `e2e/` — Playwright specs + fixtures
* `scripts/` — plain-JS build/deploy tooling
* `patches/` — patch-package patches for `@opennextjs/cloudflare`

## ☁️ Deployment

Production runs on **Cloudflare Workers** (`galaxymovies.app` + `www`):

```bash
npm run cf:build       # webpack build + OpenNext adapter + postbuild
npm run cf:preview     # build + wrangler dev locally
npm run cf:deploy      # build + deploy to the custom domain
npm run cf:secrets     # push .env.local values as worker secrets
npm run smoke          # post-deploy probe against prod
npm run smoke:workerd  # boot the built bundle under wrangler dev + smoke it
```

Scheduled jobs (streaming-change diffs, watchlist + price-drop alerts, weekly digest, social broadcasts/engagement/ad-hoc posts, content generation, charts, digital releases, GSC indexing report) run via worker `scheduled()` triggers. The daily streaming-diff video renders in GitHub Actions (workerd has no ffmpeg) and posts to TikTok, YouTube Shorts, and IG Reels.

Vercel is cold standby only — DNS records and `git.deploymentEnabled: false` in `vercel.json` keep it ready for instant rollback.

Operational detail lives in `AGENTS.md`.

Galaxy Movies uses Trakt but is not endorsed or certified by Trakt.

## License

[AGPL-3.0](LICENSE) — Copyright (C) 2026 Nicholas Fasulo. Forks are welcome, but if you run a modified version as a public service you must publish your source.
