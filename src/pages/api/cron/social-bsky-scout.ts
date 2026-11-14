import type { NextApiRequest, NextApiResponse } from 'next'
import { runBskyScout } from '../../../features/social/bskyScout'
import { isCronAuthorized } from '../../../lib/auth'

export const config = { maxDuration: 60 }

// Twice-weekly Bluesky reply scout (Tue + Fri 16:00 UTC) — finds streaming
// conversations the diff data answers and emails reply drafts for manual
// posting. Draft-only by design; there is no auto-post mode.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // No method check — the worker's scheduled() dispatch is a GET (same
  // convention as social-broadcast; a POST-only check would 405 the cron).
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await runBskyScout()
    return res.status(200).json(result)
  } catch (err) {
    console.error('Bsky scout failed:', err)
    return res.status(500).json({ error: 'Scout run failed' })
  }
}
