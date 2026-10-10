import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchTmdb } from '../../utils/tmdb'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { requireMethod, rejectBot } from '../../utils/api'

const MAX_ITEMS = 50

interface TmdbPosterFields {
  poster_path?: string | null
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  const items: { id: number; mediaType: 'movie' | 'tv' }[] = []
  for (const it of Array.isArray(req.body?.items) ? req.body.items : []) {
    if (items.length >= MAX_ITEMS) break
    const id = Number(it?.id)
    if (!Number.isInteger(id) || id <= 0) continue
    items.push({ id, mediaType: it?.mediaType === 'tv' ? 'tv' : 'movie' })
  }
  if (!items.length) return res.status(400).json({ error: 'items are required' })

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'poster_rl',
    maxRequests: 30,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  const results = await Promise.all(items.map(async ({ id, mediaType }) => {
    try {
      const t = await fetchTmdb<TmdbPosterFields>(`/${mediaType}/${id}`)
      return {
        id,
        mediaType,
        poster_path: t.poster_path || null,
        title: t.title || t.name || '',
        year: (t.release_date || t.first_air_date || '').slice(0, 4) || null
      }
    } catch {
      return null
    }
  }))

  return res.status(200).json({ results: results.filter((r) => r !== null) })
}
