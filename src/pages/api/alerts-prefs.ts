import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash } from 'crypto'
import { isBot, getClientIP, checkDistributedRateLimit } from '../../utils/rateLimiter'
import { getRedis, SYNCKEY_KEY, ALERTS_PREFS_KEY } from '../../utils/waitlistStore'
import { safeEqual } from '../../utils/auth'
import { streamingProviders } from '../../utils/tmdb'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/
const KEY_PATTERN = /^[0-9a-f-]{36}$/i
const MAX_WATCHLIST_ITEMS = 200
const MAX_SERVICES = 20

interface WatchlistItemInput {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
}

function parseWatchlist(input: unknown): WatchlistItemInput[] | null {
  if (!Array.isArray(input) || input.length > MAX_WATCHLIST_ITEMS) return null
  const out: WatchlistItemInput[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return null
    const { id, mediaType, title } = item as Record<string, unknown>
    if (typeof id !== 'number' || !Number.isFinite(id)) return null
    if (mediaType !== 'movie' && mediaType !== 'tv') return null
    if (typeof title !== 'string' || title.length > 300) return null
    out.push({ id, mediaType, title })
  }
  return out
}

function parseServices(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_SERVICES) return null
  if (!input.every((key) => typeof key === 'string' && key in streamingProviders)) return null
  return input as string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  if (isBot(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Bot access denied' })
  }

  const email = String(req.body?.email || '').trim().toLowerCase()
  const key = String(req.body?.key || '')
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !KEY_PATTERN.test(key)) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const watchlist = parseWatchlist(req.body?.watchlist)
  const services = parseServices(req.body?.services)
  const region = typeof req.body?.region === 'string' ? req.body.region.slice(0, 8) : 'US'
  if (!watchlist || !services) {
    return res.status(400).json({ error: 'Invalid watchlist or services payload' })
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

    await kv.hset(ALERTS_PREFS_KEY, {
      [email]: { watchlist, services, region, updatedAt: Date.now() }
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Alerts prefs store error:', err)
    return res.status(500).json({ error: 'Could not save your alert preferences.' })
  }
}
