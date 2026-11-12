---
name: programmatic-gaps
description: Research and spec new programmatic page types for search traffic — more *-alternative pages, /in/ expansion, or new page families — validated with OpenSEO demand and SERP weakness. Use when asked to find new page types to build, expand programmatic SEO, or research new landing-page families.
---

# Programmatic page-gap research

`seed-research` fills the `/lists/` pipeline; this skill hunts the next
*page type* — a repeatable URL family that answers a real query pattern the
site doesn't yet own. The `*-alternative.tsx` pages and the `/in/` URL space
are the proven templates.

## Existing families to extend (cheapest wins first)

- **`*-alternative` pages** — `src/pages/{justwatch-,reelgood-,instantwatcher-,
  flixable-,whats-on-netflix-,imdb-,tv-time-,trakt-}alternative.tsx` (check
  `src/pages/` for the live set). Any dying/competitor tool with search demand
  ("X alternative", "X replacement", "X is shutting down") is a candidate —
  InstantWatcher/Reelgood-style decay is the proven pattern.
- **`/in/` expansion** — the India URL space wraps US page factories with a
  pinned `region:'IN'` (`providerServerSideProps('movie', {region:'IN'})`,
  `leavingIndexServerSideProps('IN')`). Page types that exist for US but not
  `/in/` yet are gap candidates — but only where IN demand exists (check the
  report's `country=ind` section + `catalog:size:IN` floors).
- **Provider×genre pages, other regions** — the `/in/` machinery generalizes;
  new regions need `cf-ipcountry` handling thought through (Googlebot crawls
  from US — that's why `/in/` exists as its own URL space).

## Research flow

1. Collect candidate patterns: competitor page types we lack, queries in
   `gm:gsc:new-queries` that no page family answers, OpenSEO keyword research
   on "streaming"-adjacent patterns (e.g. "{provider} secret codes",
   "{title} ending explained" — sanity-check fit, not every pattern suits the
   site).
2. Validate with OpenSEO (batch, credit-metered): volume AND a winnable SERP
   for a young domain — Reddit/JustWatch/Netflix-owned SERPs are out; thin
   SERPs (forums, dead listicles, Pinterest) are in.
3. Check feasibility before proposing: does the data exist?
   (TMDB/Watchmode/Redis snapshots vs. needing new upstream), can the page
   carry unique value (not thin), and does it fit `getContentIndexability`
   floors (`MIN_INDEXABLE_MOVIES`, sitemap gating — thin region slices get
   noindexed anyway).

## Deliverable

A candidate list + mini-spec per winner in the **Galaxy Movies** Drive folder
(`1DwEVcNj5O9Ob4QPsmCPkSrWw-nyXWjTm`): query pattern, volume/KD evidence,
example URLs, which existing factory/component it reuses, data requirements,
indexation implications (sitemap + hreflang + `noindex` floors). Implementation
is a separate session — this skill stops at a spec an agent can build from.

## Guardrails

- Never propose a family that duplicates an existing URL space or dilutes
  crawl (the Oct-30 sitemap cut — person/company/network pages dropped for
  starving diff pages — is the cautionary tale).
- New families must have a noindex/thin-content story from day one.
