import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, SHARE_LOOKUP_KEY, ALERTS_PREFS_KEY } from '../../features/alerts/waitlistStore'
import type { TasteSide } from '../../features/ai/tasteMerge'
import { streamingProviders } from '../../features/catalog/tmdb'
import { requireMethod, rejectBot, setApiCache } from '../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import type { SyncedPrefs } from '../../lib/userData'

// Read-only view of a share link's taste data for the /movie-night merge —
// the shareId is already a public bearer token for this same data on /list/*.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const shareId = String(req.query.shareId || '')
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return res.status(400).json({ error: 'Invalid share link' })

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'shared_taste_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) return res.status(503).json({ error: 'Service unavailable' })

  try {
    const email = await kv.hget<string>(SHARE_LOOKUP_KEY, shareId)
    if (!email) return res.status(404).json({ error: 'Share link not found' })

    const prefs = await kv.hget<SyncedPrefs>(ALERTS_PREFS_KEY, email)
    const ratings = Array.isArray(prefs?.ratings) ? prefs.ratings : []
    const side: TasteSide = {
      topRated: ratings
        .filter((r) => typeof r.rating === 'number' && r.rating >= 7 && r.title)
        .sort((x, y) => y.rating - x.rating)
        .slice(0, 10)
        .map((r) => `${r.title} (${r.rating}/10)`),
      disliked: ratings
        .filter((r) => typeof r.rating === 'number' && r.rating <= 4 && r.title)
        .sort((x, y) => x.rating - y.rating)
        .slice(0, 5)
        .map((r) => String(r.title)),
      watchlist: (prefs?.watchlist || []).slice(0, 15).map((w) => String(w.title)).filter(Boolean),
      serviceKeys: (prefs?.services || []).filter((k) => k in streamingProviders)
    }

    setApiCache(res, 300, 3600)
    return res.status(200).json({ taste: side })
  } catch (err) {
    console.error('Shared taste error:', err)
    return res.status(500).json({ error: 'Could not load share link' })
  }
}
