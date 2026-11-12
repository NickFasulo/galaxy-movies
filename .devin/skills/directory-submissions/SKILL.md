---
name: directory-submissions
description: Submit Galaxy Movies to app directories, alternative-to sites, and "best of" listicles that rank for streaming-tool queries, tracking what's been submitted in Drive. Use when asked to submit the site to directories, get on AlternativeTo, or run listicle outreach.
---

# Directory & listicle submissions

Directory listings are slow-burn backlinks, but several rank for the exact
queries our `*-alternative` pages target — being listed on AlternativeTo for
JustWatch/Reelgood/InstantWatcher puts us in front of users actively
switching tools.

## Targets (in rough priority order)

1. **AlternativeTo** — list as an alternative to JustWatch, Reelgood,
   InstantWatcher, Flixable, Trakt (the site has `trakt-alternative`,
   `reelgood-alternative`, `instantwatcher-alternative`, `flixable-alternative`,
   `whats-on-netflix-alternative`, `imdb-alternative`, `tv-time-alternative`
   pages — check `src/pages/` for the current set before naming competitors).
2. **Slant** — similar alternatives model, decent domain.
3. **"Best X alternatives" listicles** — sites ranking for "justwatch
   alternative", "instantwatcher alternative" that accept additions. Ask the
   author to add us; reference our matching alternative page.
4. **Awesome lists** — awesome-streaming / awesome-selfhosted-adjacent GitHub
   lists; a PR to a list repo is a legit submission path.
5. **Subreddit sidebars/wikis** — r/cordcutters, r/NetflixBestOf wikis list
   tools; a modmail ask with the site link is the accepted path (never
   self-post — see `reddit-engagement` for community rules).
6. **Product directories** — Betalist, SaaSHub, ToolFinder-style sites.
   Product Hunt is a launch, not a listing — treat as its own event, not a
   row in this tracker.

## Submission assets (prep once, reuse)

- Name: Galaxy Movies. URL: `https://www.galaxymovies.app`
- 50-char and 150-char descriptions — draft once in the tracker doc; keep
  them factual (free, daily streaming-changes tracking, where-to-watch,
  alerts, no account needed).
- Logo + 2-3 screenshots — pull from `public/` or render fresh with the
  generate-*.js scripts; store final assets in the **Galaxy Movies** Drive
  folder (`1DwEVcNj5O9Ob4QPsmCPkSrWw-nyXWjTm`), not the repo.
- Category tags: Movies, TV, Streaming, Entertainment.

## Tracking

Keep one Google Doc/Sheet in the Galaxy Movies Drive folder as the
submission tracker: directory, submission URL, date, login used, status
(pending/live/rejected), listing URL once live. Check it before every run —
re-submitting a live listing looks sloppy.

## Guardrails

- Follow each directory's own rules (self-submission is allowed on most of
  these, but listicle adds always go through the author).
- Some forms require an account — flag anything needing credentials the
  environment doesn't have rather than inventing logins.
- Deliverables beyond the listing itself (pitch to a listicle author) go in
  the **Drafts** Drive folder in Nick's voice — never send.
