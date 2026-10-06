import type { NextApiRequest, NextApiResponse } from 'next'
import { LRUCache } from 'lru-cache'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../utils/rateLimiter'
import { requireMethod, rejectBot, setApiCache } from '../../utils/api'
import { firstParam } from '../../utils/query'
import type { WatchProvidersResponse } from '../../types/tmdb'

// Server-side proxy for TMDB watch/providers — keeps TMDB_API_KEY off the client.
// Batched so poster grids can check many movies in one request.
const providerCache = new LRUCache<string, number[]>({ max: 5000, ttl: 1000 * 60 * 60 * 6 })

const MAX_IDS = 50
const MAX_UNCACHED_LOOKUPS_PER_HOUR = 1500
const GLOBAL_UNCACHED_LOOKUPS_PER_HOUR = 20000

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const regionParam = firstParam(req.query.region) || ''
  const region = /^[A-Z]{2}$/.test(regionParam) ? regionParam : 'US'
  const mediaType = req.query.type === 'tv' ? 'tv' : 'movie'
  const ids = String(req.query.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, MAX_IDS)

  if (ids.length === 0) {
    return res.status(400).json({ error: 'ids query param required (comma-separated TMDB movie ids)' })
  }

  const clientId = getClientIP(req)
  const allowed = await checkDistributedRateLimit(clientId, {
    keyPrefix: 'wp_rl',
    maxRequests: 120,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
  }

  const results: Record<string, number[]> = {}
  const uncached = ids.filter((id) => {
    const hit = providerCache.get(`${mediaType}:${region}:${id}`)
    if (hit) results[id] = hit
    return !hit
  })

  if (uncached.length > 0) {
    const [clientOk, globalOk] = await Promise.all([
      checkDistributedRateLimit(clientId, {
        keyPrefix: 'wp_lookup_rl',
        maxRequests: MAX_UNCACHED_LOOKUPS_PER_HOUR,
        windowSeconds: 60 * 60,
        cost: uncached.length
      }),
      checkGlobalBudget('wp_lookup', {
        maxRequests: GLOBAL_UNCACHED_LOOKUPS_PER_HOUR,
        windowSeconds: 60 * 60,
        cost: uncached.length
      })
    ])
    if (!clientOk || !globalOk) {
      return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
    }
  }

  await Promise.all(uncached.map(async (id) => {
    try {
      const resp = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${process.env.TMDB_API_KEY}`)
      if (!resp.ok) {
        results[id] = []
        return
      }
      const data: WatchProvidersResponse = await resp.json()
      const flatrate = data.results?.[region]?.flatrate || []
      const providerIds = flatrate.map((p) => p.provider_id)
      providerCache.set(`${mediaType}:${region}:${id}`, providerIds)
      results[id] = providerIds
    } catch {
      results[id] = []
    }
  }))

  setApiCache(res, 21600, 86400)
  return res.status(200).json({ region, results })
}
