import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchRecommendedMovies, fetchRecommendedTv } from '../../utils/tmdb'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { requireMethod, rejectBot, setApiCache } from '../../utils/api'
import { firstParam } from '../../utils/query'

const MAX_RESULTS = 12

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const id = Number(firstParam(req.query.id))
  const mediaType = firstParam(req.query.mediaType) === 'tv' ? 'tv' : 'movie'
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Valid id is required' })
  }

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'recs_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  try {
    const data = mediaType === 'tv' ? await fetchRecommendedTv(id) : await fetchRecommendedMovies(id)
    setApiCache(res, 21600, 86400)
    return res.status(200).json({ results: (data.results || []).slice(0, MAX_RESULTS) })
  } catch (err) {
    console.error('Recommendations error:', err)
    return res.status(502).json({ error: 'Could not load recommendations' })
  }
}
