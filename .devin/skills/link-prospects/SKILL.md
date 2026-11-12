---
name: link-prospects
description: Build a qualified backlink-prospect list for Galaxy Movies using OpenSEO data and known SERP footprints, matched to the site's linkable assets (embed widgets, churn study, open JSON/RSS feeds). Use when asked to find link prospects, build an outreach list, or find sites to pitch.
---

# Link prospecting for Galaxy Movies

This is the prospecting engine that feeds the pitch skills (`widget-outreach`,
`churn-study-pr`, `directory-submissions`). It produces a qualified prospect
table in Google Drive — never a file in the repo (no-stray-files rule) and
never mass-sent email.

## Linkable assets (what we're pitching)

| Asset | URL | Pitch fit |
|---|---|---|
| Provider embed widget | `/embed/{provider}` (`?theme=light`) | sites publishing streaming roundups |
| Churn stat card | `/embed/churn` | journalists citing monthly numbers |
| Streaming churn study | `/reports/streaming-churn` + `/api/reports/churn.csv` | data/press coverage |
| Open JSON feed | `/api/streaming-changes?provider={key\|all}` | devs, newsletter/tool builders |
| RSS + ICS feeds | `/api/rss/{provider}`, `/api/cal/{provider}` | aggregator/feed-tool sites |
| Widgets landing page | `/widgets` | directories, resource pages |

Embeddable providers come from `isEmbeddableProvider` in
`src/features/catalog/embed.ts` (US set only — IN diffs carry no `coming`
data). Check it before promising a provider in a pitch.

## OpenSEO access

OpenSEO tools come through the `openseo` MCP server — project `Galaxy Movies`
(id `13219778-f63d-4914-8350-47122b2c3a4a`), property
`https://www.galaxymovies.app/`. Every call is credit-metered: batch research
into few calls and warn the user before any planned batch over ~2,000 credits.
The global `link-prospecting` skill has the generic mechanics; this file pins
the Galaxy-specific targets.

## Prospect sources (in priority order)

1. **Competitor backlinks** — pull backlink data for the set that already
   wins this niche: whats-on-netflix.com, decider.com, instantwatcher.com,
   flixable.com, justwatch.com, reelgood.com. Sites linking to two or more
   competitors are warm — they cover the beat and already link out.
2. **SERP footprints** — research SERPs for queries like
   "leaving netflix this month", "new on hulu", "coming to netflix",
   "streaming this week". Sites publishing these posts monthly are the exact
   fit for the widget (it does their job for free).
3. **JustWatch/embed detectors** — sites already embedding a JustWatch or
   Reelgood widget have proven they'll take an iframe. Find them via SERP
   research plus a web search for pages containing "justwatch" embed markup.
4. **Unlinked mentions** — web search `"galaxymovies.app"` and
   `"Galaxy Movies"` for mentions without links; a polite ask converts these
   fastest.
5. **Resource pages** — "best streaming tools", "sites like justwatch",
   streaming-resources listicles. These overlap the directory-submissions
   skill's targets; dedupe against it.

## Qualification

Keep a prospect only if it: publishes or curates streaming/entertainment
content regularly, has a reachable contact path (contact page, author byline,
about page, newsletter reply address), and isn't a pure park/spam domain.
Small engaged blogs beat DR-90 news sites that will never reply.

## Output

Save the prospect table as a Google Doc (or Sheet) in the **Galaxy Movies**
Drive folder (`1DwEVcNj5O9Ob4QPsmCPkSrWw-nyXWjTm`) via the google-workspace
MCP. Columns: site, contact path, best-fit asset, angle/why-now, source
(which competitor backlink or SERP surfaced it), status. Reuse and update the
same doc across runs rather than creating one per session — record its link
in the doc itself.

## Guardrails

- Report counts per source (e.g. "34 from competitor backlinks, 12 SERP") and
  what got filtered out — the list's provenance matters for follow-ups.
- Never draft or send pitch emails here — hand qualified prospects to
  `widget-outreach` or `churn-study-pr`, which own the pitch copy.
