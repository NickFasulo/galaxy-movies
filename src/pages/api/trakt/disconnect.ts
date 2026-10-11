import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/rateLimiter'
import { getLinkedEmail } from '../../../utils/billing'
import { getRedis, TRAKT_KEY } from '../../../utils/waitlistStore'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'trakt_rl',
    maxRequests: 30,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) {
    return res.status(403).json({ error: 'Invalid sync credentials' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Trakt sync is temporarily unavailable.' })
  }

  try {
    await kv.hdel(TRAKT_KEY, email)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Trakt disconnect error:', err)
    return res.status(500).json({ error: 'Could not disconnect Trakt.' })
  }
}
