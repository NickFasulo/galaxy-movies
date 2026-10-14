import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/rateLimiter'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../../utils/billing'
import { getRedis, ALERTS_PREFS_KEY } from '../../../utils/waitlistStore'
import { pullFromTrakt, traktAccessToken, traktConfigured } from '../../../utils/trakt'
import { traktRedirectUri } from './connect'
import type { SyncedPrefs } from '../../../utils/userData'

// Pull direction of /api/trakt/sync — merges Trakt's watchlist/ratings into
// the stored prefs snapshot. Stored entries always win conflicts; only
// unseen tmdb ids get appended, capped at the Plus sync limits.
const PLUS_LIMITS = { watchlist: 1000, ratings: 2500 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  if (!traktConfigured()) {
    return res.status(503).json({ error: 'Trakt import is temporarily unavailable.' })
  }

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'trakt_rl',
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
    return res.status(403).json({ error: 'Galaxy Plus is required for Trakt import.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Trakt import is temporarily unavailable.' })
  }

  try {
    const auth = await traktAccessToken(email, traktRedirectUri)
    if ('error' in auth) {
      return auth.error === 'not_connected'
        ? res.status(409).json({ error: 'Trakt is not connected. Please reconnect.', code: 'not_connected' })
        : res.status(503).json({ error: 'Trakt import is temporarily unavailable.' })
    }

    const pulled = await pullFromTrakt(auth.token)
    if (!pulled) {
      return res.status(502).json({ error: 'Could not read your Trakt profile. Please try again.' })
    }

    const stored = await kv.hget<SyncedPrefs>(ALERTS_PREFS_KEY, email)
    const watchlist = [...(stored?.watchlist || [])]
    const seenWatchlist = new Set(watchlist.map((w) => `${w.mediaType || 'movie'}:${w.id}`))
    let addedWatchlist = 0
    for (const item of pulled.watchlist) {
      if (watchlist.length >= PLUS_LIMITS.watchlist) break
      const key = `${item.mediaType}:${item.id}`
      if (seenWatchlist.has(key)) continue
      seenWatchlist.add(key)
      watchlist.push({ id: item.id, mediaType: item.mediaType, title: item.title.slice(0, 300), poster_path: null, year: item.year })
      addedWatchlist++
    }

    const ratings = [...(stored?.ratings || [])]
    const seenRatings = new Set(ratings.map((r) => `${r.mediaType || 'movie'}:${r.id}`))
    let addedRatings = 0
    for (const item of pulled.ratings) {
      if (ratings.length >= PLUS_LIMITS.ratings) break
      const key = `${item.mediaType}:${item.id}`
      if (seenRatings.has(key)) continue
      seenRatings.add(key)
      ratings.push({ id: item.id, mediaType: item.mediaType, title: item.title.slice(0, 300), rating: item.rating, poster_path: null, year: item.year })
      addedRatings++
    }

    if (addedWatchlist || addedRatings) {
      await kv.hset(ALERTS_PREFS_KEY, {
        [email]: {
          watchlist,
          services: stored?.services || [],
          region: stored?.region || 'US',
          ratings,
          updatedAt: Date.now()
        }
      })
    }

    return res.status(200).json({ ok: true, imported: { watchlist: addedWatchlist, ratings: addedRatings } })
  } catch (err) {
    console.error('Trakt import error:', err)
    return res.status(500).json({ error: 'Could not import from Trakt.' })
  }
}
