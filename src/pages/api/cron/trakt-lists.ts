import type { NextApiRequest, NextApiResponse } from 'next'
import { buildTraktLists } from '../../../features/social/traktLists'
import { isCronAuthorized } from '../../../lib/auth'

export const config = { maxDuration: 60 }

// Serves the desired list contents — the Trakt writes happen in
// scripts/trakt-lists-sync.js on a residential connection (api.trakt.tv's edge
// blocks datacenter IPs), so this endpoint is called by that script, not a
// worker cron trigger.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const plan = await buildTraktLists()
    return res.status(200).json(plan)
  } catch (err) {
    console.error('Trakt lists plan failed:', err)
    return res.status(500).json({ error: 'Trakt lists failed' })
  }
}
