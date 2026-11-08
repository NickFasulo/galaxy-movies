---
name: seed-research
description: Research and validate keyword candidates for the /lists/ content pipeline using OpenSEO data (volume, difficulty, SERP), then append winners to src/features/catalog/topicSeeds.ts. Use when asked to find list topics, expand topicSeeds, run keyword research for content, or check what search demand the site should target.
---

# Seed research for generated list pages

The `/lists/` pipeline (`generate-content` cron) works through `topicSeeds.ts`
in array order — the cron takes the first 3 pending seeds daily, so **order is
priority**: hot-title seeds go at the front, evergreen backlog at the end.

Seeds only earn their keep if real search demand exists. This skill is the
repeatable research flow: collect candidate phrases from first-party demand
data, validate volume/difficulty with OpenSEO, append winners.

## OpenSEO access

OpenSEO's API surface is its hosted MCP server (`https://app.openseo.so/mcp`,
bearer `oseo_` key — created at app.openseo.so → Settings → API keys). Add to
the agent MCP config (`%APPDATA%/devin/mcp_config.json` for Devin CLI):

```json
"openseo": {
  "url": "https://app.openseo.so/mcp",
  "headers": { "Authorization": "Bearer oseo_YOUR_KEY" }
}
```

Tools appear next session. Every call is credit-metered — batch candidates
into few calls (research one seed topic at up-to-500-ideas granularity rather
than per-phrase lookups). US first; run an `in`-locale batch only for
India-specific candidates.

## Candidate sources (in priority order)

1. **`gm:gsc:new-queries`** (Redis JSON, TTL 8d) — `[{q, imp, pos}]` queries
   that newly appeared in Search Console last week; persisted by the
   indexing-report cron. Real demand with zero clicks = unmet intent.
2. **Chat demand log** — `getChatDemand` topQuestions in the same weekly
   email; exact phrases users typed into the assistant.
3. **Trending "movies like X"** — TMDB `/trending/movie|tv/week` titles that
   don't yet have a `similar` seed. Check `slug: 'movies-like-*'` entries in
   topicSeeds first.
4. **GSC near-misses** — pages at pos 11-25 in the weekly digest whose query
   phrasing suggests a list angle.

## Flow

1. Pull candidates from sources above (Redis via the `upstash` MCP server, or
   the latest weekly email).
2. Dedupe against existing `topicSeeds` slugs/keywords and existing `/lists/`
   pages (`getGeneratedLists` + `curatedLists`).
3. OpenSEO keyword research on the deduped candidate set: keep keywords with
   meaningful volume and winnable KD for a young domain. SERP-inspect the top
   handful — a SERP owned by Reddit/JustWatch/Netflix itself isn't winnable;
   thin SERPs (forums, Pinterest, dead listicles) are.
4. Append winners to `src/features/catalog/topicSeeds.ts`:
   - `similar` seeds: `{ slug: 'movies-like-<slug>', keyword: 'movies like <title>', type: 'similar', movieTitle: '<TMDB title>' }` (verify the TMDB title resolves — the generator searches by `movieTitle`/`showTitle`)
   - `discover` seeds: `{ slug: '<kebab>', keyword: '<phrase>', type: 'discover', hint: '<optional constraint hint>' }`
   - Slugs must match `/^[a-z0-9-]+$/` and not collide with `curatedLists` keys.
5. Update the provenance comment at the top of `topicSeeds.ts` (batch date +
   data source) — the comment exists so future passes know which batch came
   from where.
6. India candidates get `'IN'` notes in `hint` where the generator supports it.

## Adjacent research (same credits, different payoffs)

- **Dead-competitor validation**: `instantwatcher`, `flixable`,
  `can i stream it` alternative queries — the pages already exist
  (`src/pages/*-alternative.tsx`); check whether the SERP is weak enough to
  actually rank.
- **Backlink-gap for outreach**: competitor backlink data on whats-on-netflix
  / decider gives the press/blog target list for the churn data-study
  (`/reports/streaming-churn` + `/api/reports/churn.csv`) and the
  `/embed/[provider]` widget play.

## Guardrails

- Never append seeds without a volume/KD check — the Oct 2026 popularity-only
  reseed batch (marked in the file's comment) landed when OpenSEO credits were
  exhausted, and the /lists/ tracker still shows zero ranked pages.
- Don't reorder existing seeds; new validated winners go above unvalidated
  backlog only when the data clearly justifies it (trending-title seeds are
  time-sensitive by nature).
- Report what was researched, what was rejected and why (volume/KD/SERP), not
  just what was added.
