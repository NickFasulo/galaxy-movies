import type { NextApiRequest, NextApiResponse } from 'next'
import { getWeeklyPriceDrops } from '../../features/alerts/priceDrops'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import { requireMethod, setApiCache } from '../../lib/http'

// Public weekly-deals feed — powered by the Wednesday price-drop cron's
// cross-subscriber rollup. Consumed by scripts/generate-tiktok-video.js
// (--kind pricedrops); one Redis read per request.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireMethod(req, res, 'GET')) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'pricedrops_rl',
    maxRequests: 120,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', '3600')
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const data = await getWeeklyPriceDrops()
  if (!data?.drops?.length) return res.status(404).json({ error: 'no drops this week' })

  setApiCache(res, 3600, 86400)
  return res.status(200).json(data)
}
