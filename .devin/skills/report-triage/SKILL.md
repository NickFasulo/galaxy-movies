---
name: report-triage
description: Turn the Monday indexing-report email into a prioritized action list — routing new queries to seed research, pending pages to indexing checks, CTR gaps to title rewrites, and flagging Bing/IN issues. Use when asked to triage the GSC report, act on the indexing email, or do the weekly SEO review.
---

# Weekly report triage

The `/api/cron/indexing-report` cron (Mon 14:00 UTC) emails
`INDEXING_REPORT_EMAIL` (default `fasulo.nick@gmail.com`) a GSC digest. This
skill reads the latest email and converts it into a short, prioritized action
list — connecting each section to the skill that owns the follow-through.

## Fetch

Use the google-workspace MCP: `search_gmail_messages` on
`fasulo.nick@gmail.com` for the latest indexing-report subject, then
`get_gmail_message_content` (`include_links: true` — the inspect deep-links
are in the HTML). If email fetch fails, the underlying Redis keys are the
fallback (`gm:gsc:new-queries`, `gm:gsc:lists-bands`, `gm:indexing:last-report`,
`gm:indexnow:last`, `chat:log`).

## Section → action routing

| Report section | What to do with it |
|---|---|
| Pending pages (NEW vs `gm:indexing:last-report` signature) | Collect the inspect deep-links → hand to the user (or run `indexing-check` flow for a fresh pass) |
| Newly-appearing queries (`gm:gsc:new-queries`) | Feed as candidates into `seed-research` — real demand with zero clicks = unmet intent |
| Chat-demand (top questions, intents, titles) | Also `seed-research` candidates; repeated unanswered questions flag `chat-quality` review |
| Click movers / top pages | Movers down → check the page isn't broken (smoke it) then queue for `ctr-fix`; movers up → note what worked |
| `/lists/` position-band shifts | Bands moving down → the generated lists may need editorial work (`listEditorials`) — flag, don't auto-edit |
| CTR-gap section (monthly, first Monday) | Queue for `ctr-fix` — apply/improve the report's own suggested rewrites |
| India (`country=ind`) section | IN clicks growing → `programmatic-gaps` for `/in/` expansion; zero IN impressions → check `/in/` sitemap gating |
| Bing section | Submission quota exhausted or verdicts stuck → flag to user; `gm:indexnow:last` receipt missing → check IndexNow in the diff cron |
| Sitemap resubmit status | Errors → fix `sitemap.xml.ts` |

## Output

A short prioritized list — what to do this week, in order, each item naming
the owning skill and the one-line reason. Not a rewritten report: the user
already has the email; the value is the routing and ordering.

## Guardrails

- Don't re-run paid lookups (OpenSEO research) during triage — this skill is
  free. Candidate *collection* only; validation happens inside the owning
  skill.
- If the email is missing entirely (cron silent), that's itself the top
  finding — check `wrangler tail` / the worker's cron triggers before
  assuming no news.
