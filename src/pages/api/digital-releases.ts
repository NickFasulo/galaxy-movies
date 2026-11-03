import type { NextApiRequest, NextApiResponse } from 'next'
import { getDigitalReleases } from '../../features/catalog/digitalReleases'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import { requireMethod, setApiCache } from '../../lib/http'
import { SITE_URL } from '../../lib/site'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireMethod(req, res, 'GET')) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'digital_rl',
    maxRequests: 120,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', '3600')
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const from = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from
  const to = Array.isArray(req.query.to) ? req.query.to[0] : req.query.to
  const days = await getDigitalReleases(from || undefined, to || undefined)
  if (!days.length) return res.status(503).json({ error: 'Digital release data temporarily unavailable' })

  setApiCache(res, 3600, 86400)
  return res.status(200).json({
    days,
    attribution: {
      text: 'Powered by Galaxy Movies',
      url: `${SITE_URL}/reports`
    }
  })
}
