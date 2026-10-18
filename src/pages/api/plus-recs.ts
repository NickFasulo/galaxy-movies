import type { NextApiRequest, NextApiResponse } from 'next'
import { LRUCache } from 'lru-cache'
import { requireMethod, rejectBot } from '../../utils/core/api'
import { getClientIP, checkDistributedRateLimit } from '../../utils/core/rateLimiter'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../utils/billing/billing'
import { getRedis, ALERTS_PREFS_KEY } from '../../utils/alerts/waitlistStore'
import { loadRecsIndex, parsePrefs, topRatedTitles } from '../../utils/alerts/watchlistAlerts'
import type { MediaType } from '../../types/tmdb'

// Reads the same recs:v1:* index the alerts cron warms — most request-time
// misses are already cached; ≤5 TMDB backfills bound a cold subscriber.
const MAX_BACKFILLS = 5
const MAX_ITEMS = 20
const recsLru = new LRUCache<string, { items: { id: number; mediaType: MediaType }[] }>({
  max: 500,
  ttl: 1000 * 60 * 10
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'plusrecs_rl',
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
  if (!isPlusActive(await getBillingRecord(email))) {
    return res.status(403).json({ error: 'Galaxy Plus is required.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Recommendations are temporarily unavailable.' })
  }

  try {
    const hit = recsLru.get(email)
    if (hit) return res.status(200).json(hit)

    const prefs = parsePrefs(await kv.hget(ALERTS_PREFS_KEY, email))
    const sources = prefs ? topRatedTitles(prefs) : []
    if (!prefs || !sources.length) {
      const empty = { items: [] as { id: number; mediaType: MediaType }[] }
      recsLru.set(email, empty)
      return res.status(200).json(empty)
    }

    const index = await loadRecsIndex([prefs], MAX_BACKFILLS)

    const seen = new Set<string>()
    for (const w of prefs.watchlist) seen.add(`${w.mediaType || 'movie'}:${w.id}`)
    for (const r of prefs.ratings || []) seen.add(`${r.mediaType || 'movie'}:${r.id}`)

    // Round-robin the per-source rec lists so no single highly-rated title
    // dominates the shelf.
    const lists = sources.map((s) => ({ mediaType: s.mediaType, ids: index.get(`${s.mediaType}:${s.id}`) || [] }))
    const items: { id: number; mediaType: MediaType }[] = []
    for (let pos = 0; items.length < MAX_ITEMS; pos++) {
      let progressed = false
      for (const { mediaType, ids } of lists) {
        const id = ids[pos]
        if (id === undefined) continue
        progressed = true
        const key = `${mediaType}:${id}`
        if (seen.has(key)) continue
        seen.add(key)
        items.push({ id, mediaType })
        if (items.length >= MAX_ITEMS) break
      }
      if (!progressed) break
    }

    recsLru.set(email, { items })
    return res.status(200).json({ items })
  } catch (err) {
    console.error('Plus recs error:', err)
    return res.status(500).json({ error: 'Could not load recommendations.' })
  }
}
