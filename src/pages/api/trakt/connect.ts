import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../../lib/rateLimiter'
import { getLinkedEmail } from '../../../features/billing/billing'
import { authorizeUrl, createPkceSession, traktConfigured } from '../../../features/billing/trakt'
import { SITE_URL } from '../../../lib/site'

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
  const session = await createPkceSession(email, key)
  if (!session) {
    return res.status(503).json({ error: 'Trakt sync is temporarily unavailable.' })
  }
  res.redirect(authorizeUrl(traktRedirectUri, session.state, session.challenge))
}
