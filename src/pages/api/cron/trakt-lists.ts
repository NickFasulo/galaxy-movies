import type { NextApiRequest, NextApiResponse } from 'next'
import { maintainTraktLists } from '../../../features/social/traktLists'
import { isCronAuthorized } from '../../../lib/auth'

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const summary = await maintainTraktLists()
    return res.status(200).json(summary)
  } catch (err) {
    console.error('Trakt lists maintenance failed:', err)
    return res.status(500).json({ error: 'Trakt lists failed' })
  }
}
