---
name: reddit-engagement
description: Plan and run genuine Reddit/community engagement around streaming-changes data — where to participate, what to contribute, and the self-promotion guardrails. Use when asked to post on Reddit, do community outreach, or grow the subreddit-presence play.
---

# Reddit & community engagement

Reddit is the highest-risk outreach channel: the communities that matter
(cordcutters, NetflixBestOf, television, movies, provider subs) ban
drive-by self-promotion on sight, and a burned account/domain doesn't come
back. Engagement here means contributing the data where it's already wanted,
not posting links.

## Where the data already helps

- Monthly "what's leaving" threads in r/NetflixBestOf, r/Hulu,
  r/DisneyPlus, r/PrimeVideo — our diffs (`/api/reddit-payload`,
  `getProviderChanges`) are exactly the content those threads compile
  manually.
- r/cordcutters — catalog-size and churn conversations; the churn report's
  net-change numbers are the contribution.
- Release-day "is X on Netflix yet" questions — `getTitleChanges` /
  where-to-watch answers.
- r/webdev / r/SideProject only if there's a genuine build story — these
  subs see through launch posts.

## Rules of engagement

1. **Read each sub's self-promo rules first.** Many require ≤10% self-links
   or prior modmail approval. When in doubt, contribute the data without a
   link ("leaving Netflix Oct 30: A, B, C") — the profile/karma does the
   work.
2. **Answer-first.** Only link when the link IS the answer and the sub
   allows it.
3. Modmail for sidebar/wiki additions and recurring-thread permission is
   the sanctioned path — draft the modmail in Drive (Drafts folder), let the
   user send it.
4. The app already posts to its own account via `socialChannels.ts` (Reddit
   channel envs `REDDIT_*`) — this skill is about *other people's*
   communities, not the broadcast channel.

## The devvit app path

`scripts/generate-devvit-assets.js` exists for a Reddit app (the sanctioned,
in-platform presence). If the user wants the app route, that spec work
belongs in a normal build session — this skill covers organic engagement.

## Deliverables

- A short engagement plan in the Galaxy Movies Drive folder: target subs,
  their promo rules summary, 3-5 concrete contribution opportunities this
  week (threads to answer, data to drop), and any modmail drafts.
- Never post directly. Draft comments/modmail for the user to review.
