import { LRUCache } from 'lru-cache'
import { getRedis } from '../../utils/redis'
import { getPriceOffers } from '../../utils/prices'
import { isBot, getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'

// Server-side proxy for Watchmode pricing — keeps WATCHMODE_API_KEY off the
// client and caches hard, since free-tier Watchmode quota is monthly.
const priceCache = new LRUCache({ max: 5000, ttl: 1000 * 60 * 60 * 24 })
const PRICE_TTL_SECONDS = 60 * 60 * 24
// Empty results are usually transient (upstream hiccup, missing key) — don't
// poison the day-long cache with them.
const EMPTY_TTL_SECONDS = 60 * 10
const EMPTY_TTL_MS = EMPTY_TTL_SECONDS * 1000

const EMPTY = { offers: [], cheapest: { rent: null, buy: null }, extras: { criticScore: null, userRating: null, relevancePercentile: null } }

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  if (isBot(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Bot access denied' })
  }

  const tmdbId = String(req.query.id || '').trim()
  if (!/^\d+$/.test(tmdbId)) {
    return res.status(400).json({ error: 'id query param required (TMDB numeric id)' })
  }

  const mediaType = req.query.type === 'tv' ? 'tv' : 'movie'
  const region = /^[A-Z]{2}$/.test(req.query.region || '') ? req.query.region : 'US'
  const clientId = getClientIP(req)
  const allowed = await checkDistributedRateLimit(clientId, {
    keyPrefix: 'price_rl',
    maxRequests: 120,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
  }

  const cacheKey = `price:${mediaType}:${region}:${tmdbId}`
  const hit = priceCache.get(cacheKey)
  if (hit) {
    return res.status(200).json(hit)
  }

  const kv = getRedis()
  if (kv) {
    try {
      const cached = await kv.get(cacheKey)
      if (cached) {
        priceCache.set(cacheKey, cached)
        return res.status(200).json(cached)
      }
    } catch {}
  }

  let payload
  try {
    payload = { cacheKey, ...(await getPriceOffers({ tmdbId, mediaType, region })) }
  } catch (err) {
    console.error('Price lookup failed:', err)
    payload = { region, fetchedAt: Date.now(), ...EMPTY }
  }

  const isEmpty = !payload.offers?.length && !payload.extras?.criticScore
  priceCache.set(cacheKey, payload, { ttl: isEmpty ? EMPTY_TTL_MS : undefined })
  if (kv) {
    try {
      await kv.set(cacheKey, payload, { ex: isEmpty ? EMPTY_TTL_SECONDS : PRICE_TTL_SECONDS })
    } catch {}
  }

  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json(payload)
}
