---
name: directory-submissions
description: Submit Galaxy Movies to app directories, alternative-to sites, and "best of" listicles that rank for streaming-tool queries, tracked in the repo listings registry. Use when asked to submit the site to directories, get on AlternativeTo, or run listicle outreach.
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

The canonical tracker is `src/features/listings/listings.json` — every
directory, store, launch site, and feed with status (`live`, `in-review`,
`queued`, `needs-account`, `needs-payment`, `blocked`, `declined`,
`unknown`), submit URL, live URL, dates, and notes. Read it at the start of
every run — re-submitting a live listing looks sloppy.

Workflow per run:

1. `npm run listings:check` — fetches every `live` entry with a `liveUrl`,
   verifies the page resolves AND still links to galaxymovies.app. Failures
   and the backlog print at the end. (The Monday indexing-report cron runs
   the same check and emails the results.)
2. Fill gaps: any `live` entry missing `liveUrl` is unverifiable — find the
   real listing URL (search the site, check Gmail receipts) and add it.
3. Work the backlog: `queued`/`needs-account`/`needs-payment`/`blocked`/
   `unknown` entries are the to-do list. Update `status`, `submittedAt`,
   `liveUrl`, `account`, `notes` as things move — commit the JSON with the
   code that run produces (or on its own).
4. Add new directories as `queued` entries so the queue persists across
   sessions.
5. Mirror to Drive: sync the current state into the "Galaxy Movies —
   Listings Registry" Sheet (id `18GE4zz9Rp0Za8J8buB_NgRCYCB1htGmbiI4aiWT9FlU`,
   Galaxy Movies folder) so there's a human-readable copy outside git — export
   the JSON to CSV into `shots/`, upload with `import_to_google_sheets`, delete
   the local copy. Repo registry stays the source of truth; the older
   "Directory Submissions" Google Doc is superseded.

## Guardrails

- Follow each directory's own rules (self-submission is allowed on most of
  these, but listicle adds always go through the author).
- Some forms require an account — flag anything needing credentials the
  environment doesn't have rather than inventing logins.
- Deliverables beyond the listing itself (pitch to a listicle author) go in
  the **Drafts** Drive folder in Nick's voice — never send.
