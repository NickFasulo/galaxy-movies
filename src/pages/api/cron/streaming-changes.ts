import type { NextApiRequest, NextApiResponse } from 'next'
import { updateStreamingChanges } from '../../../utils/streamingChanges'
import { isCronAuthorized } from '../../../utils/auth'

export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const summary = await updateStreamingChanges()
    return res.status(200).json(summary)
  } catch (err) {
    console.error('Streaming changes update failed:', err)
    return res.status(500).json({ error: 'Update failed' })
  }
}
