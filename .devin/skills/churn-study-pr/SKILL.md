---
name: churn-study-pr
description: Run the monthly digital-PR push for the streaming churn report — pitch journalists and streaming blogs on the arrivals-vs-departures data with an embeddable stat card, drafting emails into Google Drive. Use when asked to pitch the churn study, do press outreach, or promote the monthly report.
---

# Churn-study PR

`/reports/streaming-churn` is the site's digital-PR asset: monthly
arrivals-vs-departures numbers per service, backed by daily TMDB catalog
snapshots (`changes:monthly:{provider}:{month}`, `catalog:size:{region}`) and
downloadable via `/api/reports/churn.csv`. Journalists covering "what's
leaving Netflix" need exactly this data every month.

## Cadence

Monthly, timed to the report refresh (the monthly diff keys land at month
boundaries via `updateStreamingChanges`). Pitching a few days *before* month
end — when the "what's leaving next month" news cycle peaks — beats pitching
after. An embargoed early look is the strongest hook.

## Prospects

- Journalists/bloggers who write monthly "leaving X" or "new on X" posts:
  pull recent bylines via web search and OpenSEO SERP research on churn
  queries ("what's leaving netflix", "hulu july 2026"). Decider, What's on
  Netflix, Cord Cutters News, Tom's Guide streaming, 9to5* weekend streaming
  columns are the archetypes; any site that quotes numbers is a fit.
- The `link-prospects` Drive doc is the shared store — check it first,
  append new finds there.

## Pitch shape

1. Lead with the numbers: "Netflix lost N titles and gained M in October —
   net -X on a catalog of Y." Pull real figures from `/api/reports/churn.csv`
   or `/reports/streaming-churn`, never round into claims the CSV can't
   support.
2. Offer the embeddable `/embed/churn` stat card for their article (it
   carries the Powered-by link).
3. Offer the raw CSV — journalists trust a dataset more than a paragraph.
4. One-line methodology note (daily TMDB snapshots, ~1,600-title catalog
   depth) so they can defend the numbers.

## Deliverables

- Draft emails as Google Docs in the **Drafts** folder
  (`1559qAvUIM1Lz__5Mv_fDe0C4h-micsL0`, `fasulo.nick@gmail.com`) via
  `import_to_google_doc` — Nick's voice: no em/en dashes, contractions, no
  AI tells.
- A short "this month's hook" summary doc: the 3-4 most newsworthy numbers
  (biggest net loss, surprise departure, catalog size milestones) so pitches
  stay consistent.
- Update the prospect doc status column. **Drafts only — never send.**

## Guardrails

- Numbers quoted in a pitch must come from the actual report/CSV for that
  month — don't paraphrase from memory.
- If the churn data looks wrong (e.g. a reseed month reports zero adds/lefts
  — see the `src:'tmdb:v2'` snapshot note in AGENTS.md), flag it instead of
  pitching bad data.
