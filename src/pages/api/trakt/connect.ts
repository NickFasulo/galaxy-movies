import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/core/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/core/rateLimiter'
import { getLinkedEmail } from '../../../utils/billing/billing'
import { authorizeUrl, signState, traktConfigured } from '../../../utils/billing/trakt'
import { SITE_URL } from '../../../utils/core/site'

export const traktRedirectUri = `${SITE_URL}/api/trakt/callback`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  if (!traktConfigured()) {
    return res.status(503).json({ error: 'Trakt sync is temporarily unavailable.' })
  }

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

  const key = String(req.query.key || '')
  res.redirect(authorizeUrl(traktRedirectUri, signState(email, key)))
}
