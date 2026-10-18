import type { NextApiRequest, NextApiResponse } from 'next'
import { getClientIP, checkDistributedRateLimit } from '../../utils/core/rateLimiter'
import { requireMethod, rejectBot } from '../../utils/core/api'
import { safeEqual } from '../../utils/core/auth'
import { aggregateUsage, type UsagePanel } from '../../utils/core/usageSources'

const CACHE_MS = 60_000
let cached: { at: number; panels: UsagePanel[] } | null = null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'usage_rl',
    maxRequests: 30,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const token = process.env.USAGE_DASH_TOKEN
  if (!token || !safeEqual(req.headers.authorization || '', `Bearer ${token}`)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Panels fan out to ~a dozen billed Redis reads plus vendor APIs — a short
  // cache keeps refreshes cheap without staleness anyone will notice.
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { at: Date.now(), panels: await aggregateUsage() }
  }
  return res.status(200).json({ generatedAt: cached.at, panels: cached.panels })
}
