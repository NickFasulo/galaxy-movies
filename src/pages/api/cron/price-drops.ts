import type { NextApiRequest, NextApiResponse } from 'next'
import { isCronAuthorized } from '../../../lib/auth'
import { sendPriceDropAlerts } from '../../../features/alerts/priceDrops'

// Weekly price-drop sweep. Wednesdays: offset from the Friday digest so the
// Watchmode burst never lands on the same hour as user-facing traffic peaks.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ skipped: 'RESEND_API_KEY not set' })
  }
  if (!process.env.WATCHMODE_API_KEY) {
    return res.status(200).json({ skipped: 'WATCHMODE_API_KEY not set' })
  }

  try {
    const result = await sendPriceDropAlerts()
    return res.status(200).json(result)
  } catch (err) {
    console.error('Price-drop alerts failed:', err)
    return res.status(500).json({ error: 'Price-drop alerts failed' })
  }
}
