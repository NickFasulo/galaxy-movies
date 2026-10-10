import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash } from 'crypto'
import { getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { requireMethod, rejectBot } from '../../utils/api'
import { getRedis, SYNCKEY_KEY, ALERTS_PREFS_KEY } from '../../utils/waitlistStore'
import { safeEqual } from '../../utils/auth'
import { streamingProviders } from '../../utils/tmdb'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/
const KEY_PATTERN = /^[0-9a-f-]{36}$/i
const MAX_WATCHLIST_ITEMS = 200
const MAX_SERVICES = 20
const MAX_RATINGS = 500

interface StoredItem {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  poster_path: string | null
  year: string | null
}

interface StoredRating extends StoredItem {
  rating: number
}

function optionalText(value: unknown, max: number): string | null {
  return typeof value === 'string' ? value.slice(0, max) || null : null
}

function parseIdTitleMedia(item: unknown): Pick<StoredItem, 'id' | 'mediaType' | 'title'> | null {
  if (!item || typeof item !== 'object') return null
  const { id, mediaType, title } = item as Record<string, unknown>
  if (typeof id !== 'number' || !Number.isFinite(id)) return null
  if (mediaType !== 'movie' && mediaType !== 'tv') return null
  if (typeof title !== 'string' || title.length > 300) return null
  return { id, mediaType, title }
}

function parseWatchlist(input: unknown): StoredItem[] | null {
  if (!Array.isArray(input) || input.length > MAX_WATCHLIST_ITEMS) return null
  const out: StoredItem[] = []
  for (const raw of input) {
    const item = parseIdTitleMedia(raw)
    if (!item) return null
    const rec = raw as Record<string, unknown>
    out.push({ ...item, poster_path: optionalText(rec.poster_path, 500), year: optionalText(rec.year, 10) })
  }
  return out
}

// Absent ratings array = old client — treated as empty rather than invalid.
function parseRatings(input: unknown): StoredRating[] | null {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input) || input.length > MAX_RATINGS) return null
  const out: StoredRating[] = []
  for (const raw of input) {
    const item = parseIdTitleMedia(raw)
    if (!item) return null
    const rec = raw as Record<string, unknown>
    if (typeof rec.rating !== 'number' || !Number.isInteger(rec.rating) || rec.rating < 1 || rec.rating > 10) return null
    out.push({ ...item, rating: rec.rating, poster_path: optionalText(rec.poster_path, 500), year: optionalText(rec.year, 10) })
  }
  return out
}

function parseServices(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_SERVICES) return null
  if (!input.every((key) => typeof key === 'string' && key in streamingProviders)) return null
  return input as string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return
  if (rejectBot(req, res)) return

  const source = req.method === 'GET' ? req.query : req.body || {}
  const email = String(source.email || '').trim().toLowerCase()
  const key = String(source.key || '')
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !KEY_PATTERN.test(key)) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const clientId = getClientIP(req)
  const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 32)
  const [ipOk, emailOk] = await Promise.all([
    checkDistributedRateLimit(clientId, { keyPrefix: 'alerts_prefs_rl', maxRequests: 30, windowSeconds: 60 * 60 }),
    checkDistributedRateLimit(emailHash, { keyPrefix: 'alerts_prefs_email_rl', maxRequests: 30, windowSeconds: 60 * 60 })
  ])
  if (!ipOk || !emailOk) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Alerts sync is temporarily unavailable.' })
  }

  try {
    const stored = await kv.hget<string>(SYNCKEY_KEY, email)
    if (!stored || !safeEqual(stored, key)) {
      return res.status(403).json({ error: 'Invalid sync credentials' })
    }

    if (req.method === 'GET') {
      const prefs = await kv.hget(ALERTS_PREFS_KEY, email)
      return res.status(200).json({ prefs: prefs ?? null })
    }

    const watchlist = parseWatchlist(req.body?.watchlist)
    const services = parseServices(req.body?.services)
    const ratings = parseRatings(req.body?.ratings)
    const region = typeof req.body?.region === 'string' ? req.body.region.slice(0, 8) : 'US'
    if (!watchlist || !services || !ratings) {
      return res.status(400).json({ error: 'Invalid watchlist, services, or ratings payload' })
    }

    await kv.hset(ALERTS_PREFS_KEY, {
      [email]: { watchlist, services, region, ratings, updatedAt: Date.now() }
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Alerts prefs store error:', err)
    return res.status(500).json({ error: 'Could not save your alert preferences.' })
  }
}
