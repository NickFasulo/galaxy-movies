import type { NextApiRequest, NextApiResponse } from 'next'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { requireMethod, rejectBot, setApiCache } from '../../utils/api'
import { firstParam } from '../../utils/query'
import { getProviderCatalog } from '../../utils/providerCatalog'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const regionParam = firstParam(req.query.region) || ''
  const region = /^[A-Z]{2}$/.test(regionParam) ? regionParam : 'US'

  const ip = getClientIP(req)
  const allowed = await checkDistributedRateLimit(ip, {
    keyPrefix: 'pc_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
  }

  try {
    const providers = await getProviderCatalog(region)
    setApiCache(res, 86400, 172800, { cdn: true })
    return res.status(200).json({ region, providers })
  } catch (error) {
    console.error('provider-catalog error:', error)
    return res.status(500).json({ error: 'Provider catalog unavailable' })
  }
}
