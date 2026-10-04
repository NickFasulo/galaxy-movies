import { updateStreamingChanges } from '../../../utils/streamingChanges'

export const config = { maxDuration: 60 }

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.authorization === `Bearer ${secret}`
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
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
