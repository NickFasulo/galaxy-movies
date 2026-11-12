---
name: widget-outreach
description: Pitch the free /embed streaming-changes widget and JSON feed to sites that publish monthly streaming roundups, drafting per-site emails in Nick's voice into Google Drive. Use when asked to run widget outreach, pitch the embed, or get sites embedding Galaxy Movies data.
---

# Widget outreach

The `/embed/[provider]` iframe is the cleanest link-building play: a site gets
a free, daily-updated "new on X / leaving X" block, we get a "Powered by
Galaxy Movies" link plus referral traffic. `/widgets` is the landing page
with live previews and copy-paste snippets.

## What a site can take

- **Provider widget**: `https://www.galaxymovies.app/embed/{provider}`
  (`?theme=light` for light sites). The live provider set comes from
  `embeddableProviders()` in `src/features/catalog/embed.ts` (currently ~20:
  Netflix through Criterion) — US catalogs only.
- **Churn card**: `/embed/churn` — monthly arrivals/departures stat card.
- **JSON feed**: `/api/streaming-changes?provider={key|all}` — `added`,
  `left`, `coming` arrays, CORS `*`, 120/hr, no key. For builders/newsletters.
- **RSS/ICS**: `/api/rss/{provider}`, `/api/cal/{provider}`.

Verify a provider is in `embeddableProviders()` before offering it — IN
providers (JioHotstar etc.) aren't embeddable.

## Prospects

Pull from the `link-prospects` skill's Drive doc, or generate directly: sites
that publish "new on Netflix this month" / "leaving Hulu" posts (movie blogs,
cord-cutter blogs, local news entertainment verticals, newsletters, WordPress
sites, fandom wikis). The ideal prospect posts these manually every month —
the pitch is "stop maintaining this".

## Pitch shape

Keep it short and concrete:

1. One line on what the widget does (daily "added/leaving" list for the
   service they cover, auto-updates, styled to match).
2. The exact embed snippet for their site (pick their provider + theme).
3. Attribution line: free with the Powered-by link kept.
4. Optional developer path: JSON/RSS feed if they'd rather render their own.

No hype. If the site only ever links interactive content, lead with the JSON
feed instead of the iframe.

## Deliverables

- Per-prospect draft emails as Google Docs in the **Drafts** Drive folder
  (`1559qAvUIM1Lz__5Mv_fDe0C4h-micsL0`, `fasulo.nick@gmail.com`) via
  `import_to_google_doc`. Write in Nick's voice per the global draft rules:
  no em/en dashes, contractions, varied rhythm, no AI tells.
- Update the prospect doc's status column (drafted / sent / replied /
  embedded / declined) so later runs don't re-pitch.
- **Drafts only.** The user reviews and sends — never send outreach yourself.

## Follow-ups

One follow-up after ~7 days, one line, referencing the original draft. If a
site embeds, note the URL in the tracker — embedded pages are worth checking
in the weekly report's referral data.
