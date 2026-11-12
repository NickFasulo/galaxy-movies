---
name: ctr-fix
description: Rewrite titles and meta descriptions on pages the CTR-gap report flags as ranking-but-not-clicked, applying (or improving on) the report's own AI suggestions. Use when asked to fix CTR gaps, rewrite titles/descriptions for search, or act on the CTR section of the indexing report.
---

# CTR-gap fixes

The indexing-report cron computes a monthly CTR-gap section: pages with real
impressions whose CTR trails what their position should earn, and it drafts
suggested title/description pairs via `suggestCtrRewrites` in
`src/features/indexing/ctrSuggest.ts`. The report is advisory only — this
skill is the execution half: turn flagged pages into actual `PageHead` edits.

## Flow

1. **Get the flagged set** — read the latest indexing-report email (Gmail via
   google-workspace MCP on `fasulo.nick@gmail.com`, subject from the
   `/api/cron/indexing-report` run) or pull CTR gaps directly through the
   `openseo` MCP `get_search_console_performance` (pages sorted by
   impressions, compare CTR to position).
2. **Map each URL to its source** — the URL path tells you which module owns
   the title: `/leaving/{p}` and `/this-month/{p}` factories,
   `/streaming/{p}[/{genre}]` ProviderPage/ProviderGenrePage, detail pages
   (`TitleDetailPage`), `/lists/` generated pages (title/description come
   from the generator — fix `topicSeeds`/`listEditorials` inputs, not the
   output).
3. **Rewrite titles/descriptions** — edit the `PageHead` props
   (`src/components/PageHead.tsx`) at the page/factory level:
   - Title: front-load the dominant query phrase, under ~60 chars. The
     report's suggestions are a baseline — improve on them when the phrasing
     is clearly better.
   - Description: under ~160 chars, concrete (which services, dates, the
     get-alerted hook). No hype, no caps.
   - Leave `canonicalUrl`, `hreflangAlternates`, `structuredData` untouched
     unless the rewrite requires it.
4. **Guardrails** — dynamic titles built from data (provider names, counts,
   dates) should stay dynamic; hardcode only the static scaffold. Keep each
   page's unique angle — don't converge titles across similar pages or
   they'll cannibalize.

## Verify

- `npm run typecheck` + `npm test` — PageHead prop changes are type-checked;
  snapshot tests may need updating.
- Check one rendered page locally (`npm run dev`) — view source for the new
  `<title>`/`<meta name="description">`.
- Commit with the other title changes; note which report section motivated it.

## Notes

- CTR changes take weeks to show in GSC — log what was changed so the next
  report's movers section can be read against it.
- IN pages (`/in/*`) share components via the effective-region prefix — a
  title fix on the shared module fixes both.
