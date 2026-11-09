import type { NextApiRequest, NextApiResponse } from 'next'
import { firstParam, requireMethod, setApiCache } from '../../../lib/http'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../../lib/rateLimiter'
import { resolveWhere, whereCacheKey, whereResultCache, type WhereQuery } from '../../../features/catalog/whereLookup'
import { SITE_URL } from '../../../lib/site'

// Public title→providers resolver for the browser extension, MCP server, and
// any third-party caller (mirrors the openapi.json attribution terms). Keyless
// like /api/streaming-changes; TMDB spend is bounded by the LRU + lookup budget.
const MAX_LOOKUPS_PER_HOUR = 800
const GLOBAL_LOOKUPS_PER_HOUR = 3000

function parseQuery(req: NextApiRequest): { q: WhereQuery } | { error: string } {
  const rawType = firstParam(req.query.type)
  const type = rawType === 'movie' || rawType === 'tv' ? rawType : undefined
  const regionParam = firstParam(req.query.region)
  const region = regionParam && /^[a-zA-Z]{2}$/.test(regionParam) ? regionParam.toUpperCase() : 'US'

  const rawId = firstParam(req.query.id)
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : undefined
  const imdbId = firstParam(req.query.imdb_id)
  const title = (firstParam(req.query.title) || '').trim().slice(0, 100) || undefined
  const yearParam = firstParam(req.query.year)
  const year = yearParam && /^\d{4}$/.test(yearParam) ? yearParam : undefined

  if (id !== undefined) {
    if (!type) return { error: 'type=movie|tv is required with id' }
    return { q: { id, type, region, year } }
  }
  if (imdbId) {
    if (!/^tt\d+$/.test(imdbId)) return { error: 'imdb_id must look like tt0137523' }
    return { q: { imdbId, type, region, year } }
  }
  if (title) return { q: { title, type, region, year } }
  return { error: 'one of id, imdb_id, or title is required' }
}

const EXAMPLE = `${SITE_URL}/api/ext/where?title=fight%20club&year=1999`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireMethod(req, res, 'GET')) return
  // No rejectBot: extension background workers and MCP clients are the audience.

  const parsed = parseQuery(req)
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error, example: EXAMPLE })
  }
  const q = parsed.q

  const key = whereCacheKey(q)
  const hit = whereResultCache.get(key)
  if (hit === undefined) {
    const clientId = getClientIP(req)
    const [reqOk, clientOk, globalOk] = await Promise.all([
      checkDistributedRateLimit(clientId, { keyPrefix: 'ext_where_rl', maxRequests: 120, windowSeconds: 60 * 60 }),
      checkDistributedRateLimit(clientId, {
        keyPrefix: 'ext_where_lookup',
        maxRequests: MAX_LOOKUPS_PER_HOUR,
        windowSeconds: 60 * 60
      }),
      checkGlobalBudget('ext_where', { maxRequests: GLOBAL_LOOKUPS_PER_HOUR, windowSeconds: 60 * 60 })
    ])
    if (!reqOk || !clientOk || !globalOk) {
      res.setHeader('Retry-After', '3600')
      return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
    }
    whereResultCache.set(key, { v: await resolveWhere(q) })
  }

  const result = whereResultCache.get(key)!.v
  if (!result) {
    const fallback = q.title ? `${SITE_URL}/search?q=${encodeURIComponent(q.title)}` : SITE_URL
    return res.status(404).json({ error: 'Not found', url: fallback })
  }

  setApiCache(res, 3600, 21600)
  return res.status(200).json({
    ...result,
    attribution: { text: 'Powered by Galaxy Movies', url: result.url }
  })
}
