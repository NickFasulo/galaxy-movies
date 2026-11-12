import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import { resolveImdbItem, resolveTitleItem, resolveTvdbItem } from '../../features/ai/movieSearch'

// Batch title resolution for imports (Letterboxd CSV rows arrive as bare
// title+year; TV Time show rows can carry a tvdbId for exact /find lookups).
// Free TMDB searches, bounded by the per-IP bucket and the 50-item cap;
// chunks of 10 keep bursts under TMDB's rate ceiling.
const MAX_ITEMS = 50
const BATCH = 10

interface Item {
  title: string
  year?: string
  tvdbId?: number
  imdbId?: string
}

function parseItems(input: unknown): Item[] | null {
  if (!Array.isArray(input) || input.length > MAX_ITEMS) return null
  const out: Item[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const { title, year, tvdbId, imdbId } = raw as Record<string, unknown>
    if (typeof title !== 'string' || !title.trim() || title.length > 100) return null
    const item: Item = { title: title.trim() }
    if (typeof year === 'string' && /^\d{4}$/.test(year)) item.year = year
    if (typeof tvdbId === 'number' && Number.isInteger(tvdbId) && tvdbId > 0 && tvdbId < 1e12) item.tvdbId = tvdbId
    if (typeof imdbId === 'string' && /^tt\d{5,10}$/.test(imdbId)) item.imdbId = imdbId
    out.push(item)
  }
  return out
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'resolve_rl',
    maxRequests: 20,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const items = parseItems(req.body?.items)
  if (!items) {
    return res.status(400).json({ error: 'Invalid items payload' })
  }

  try {
    const results: ({ title: string; year?: string; resolved: Awaited<ReturnType<typeof resolveTitleItem>> })[] = []
    for (let i = 0; i < items.length; i += BATCH) {
      const resolved = await Promise.all(items.slice(i, i + BATCH).map((item) =>
        item.imdbId ? resolveImdbItem(item.imdbId, item.title, item.year)
          : item.tvdbId ? resolveTvdbItem(item.tvdbId, item.title)
          : resolveTitleItem(item.title, item.year)
      ))
      resolved.forEach((r, j) => results.push({ title: items[i + j]!.title, year: items[i + j]!.year, resolved: r }))
    }
    return res.status(200).json({ results })
  } catch (err) {
    console.error('Resolve titles error:', err)
    return res.status(500).json({ error: 'Could not resolve titles.' })
  }
}
