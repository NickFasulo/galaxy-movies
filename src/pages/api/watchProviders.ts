import type { NextApiRequest, NextApiResponse } from 'next'
import { LRUCache } from 'lru-cache'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../lib/rateLimiter'
import { requireMethod, rejectBot, setApiCache } from '../../lib/http'
import { firstParam } from '../../lib/http'
import { fetchTmdb } from '../../features/catalog/tmdb'
import type { WatchProvidersResponse } from '../../types/tmdb'

// Server-side proxy for TMDB watch/providers — keeps TMDB_API_KEY off the client.
// Batched so poster grids can check many movies in one request.
const providerCache = new LRUCache<string, number[]>({ max: 5000, ttl: 1000 * 60 * 60 * 6 })

const MAX_IDS = 50
const MAX_UNCACHED_LOOKUPS_PER_HOUR = 1500
const GLOBAL_UNCACHED_LOOKUPS_PER_HOUR = 5000

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

  const results: Record<string, number[]> = {}
  const uncached = ids.filter((id) => {
    const hit = providerCache.get(`${mediaType}:${region}:${id}`)
    if (hit) results[id] = hit
    return !hit
  })

  // Same cache-first ordering as /api/prices — a request whose ids are all
  // LRU hits costs zero Redis commands; rate limits only run when upstream
  // work is actually needed.
  if (uncached.length > 0) {
    const clientId = getClientIP(req)
    const [reqOk, clientOk, globalOk] = await Promise.all([
      checkDistributedRateLimit(clientId, {
        keyPrefix: 'wp_rl',
        maxRequests: 120,
        windowSeconds: 60 * 60
      }),
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
    if (!reqOk || !clientOk || !globalOk) {
      return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
    }
  }

  await Promise.all(uncached.map(async (id) => {
    try {
      const data = await fetchTmdb<WatchProvidersResponse>(`/${mediaType}/${id}/watch/providers`)
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
