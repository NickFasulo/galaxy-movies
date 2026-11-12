import type { NextApiRequest, NextApiResponse } from 'next'
import { getLatestCharts } from '../../features/catalog/charts'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import { requireMethod, setApiCache } from '../../lib/http'
import { SITE_URL } from '../../lib/site'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireMethod(req, res, 'GET')) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'charts_rl',
    maxRequests: 120,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', '3600')
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const feed = await getLatestCharts()
  if (!feed || (!feed.apple && !feed.netflix)) {
    return res.status(503).json({ error: 'Chart data temporarily unavailable' })
  }

  // Trakt allows showing its rankings in-app (/reports) but forbids
  // republishing them as a feed — keep the trakt bucket out of the response.
  const { generated, apple, netflix } = feed

  setApiCache(res, 3600, 86400)
  return res.status(200).json({
    generated,
    apple,
    netflix,
    attribution: {
      text: 'Powered by Galaxy Movies',
      url: `${SITE_URL}/reports`
    }
  })
}
