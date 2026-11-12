import type { NextApiRequest, NextApiResponse } from 'next'
import { runRedditEngage } from '../../../features/social/redditEngage'
import { isCronAuthorized } from '../../../lib/auth'

export const config = { maxDuration: 60 }

// Weekly community-engagement post for provider subs — Fridays 18:00 UTC.
// Draft mode (default) emails the formatted post for manual submission;
// post mode submits via the REDDIT_ENGAGE_* grant per the redditEngage
// module's notes on sub-approval.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // No method check — the worker's scheduled() dispatch is a GET (same
  // convention as social-broadcast; a POST-only check would 405 the cron).
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await runRedditEngage()
    return res.status(200).json(result)
  } catch (err) {
    console.error('Reddit engagement failed:', err)
    return res.status(500).json({ error: 'Engagement post failed' })
  }
}
