import type { NextApiRequest, NextApiResponse } from 'next'
import { sendWatchlistAlerts } from '../../../utils/watchlistAlerts'
import { isCronAuthorized } from '../../../utils/auth'

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const summary = await sendWatchlistAlerts()
    return res.status(200).json(summary)
  } catch (err) {
    console.error('Watchlist alerts failed:', err)
    return res.status(500).json({ error: 'Alerts failed' })
  }
}
