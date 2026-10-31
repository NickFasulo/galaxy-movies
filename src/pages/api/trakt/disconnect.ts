import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../../lib/rateLimiter'
import { getLinkedEmail } from '../../../features/billing/billing'
import { getRedis, TRAKT_KEY } from '../../../features/alerts/waitlistStore'
import { refreshTokens, revokeAccessToken } from '../../../features/billing/trakt'
import { traktRedirectUri } from './connect'

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
    // Best effort: kill the grant on Trakt's side so a later connect shows the
    // authorize page again instead of silently re-approving. The local link
    // drops regardless — a revoke failure must not keep us "connected".
    const link = await kv.hget<{ refreshToken?: string }>(TRAKT_KEY, email)
    if (link?.refreshToken) {
      const tokens = await refreshTokens(link.refreshToken, traktRedirectUri)
      if (tokens?.access_token && !(await revokeAccessToken(tokens.access_token))) {
        console.error('Trakt disconnect: revoke failed, dropping local link anyway')
      }
    }
    await kv.hdel(TRAKT_KEY, email)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Trakt disconnect error:', err)
    return res.status(500).json({ error: 'Could not disconnect Trakt.' })
  }
}
