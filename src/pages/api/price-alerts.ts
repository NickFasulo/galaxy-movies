import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { getBillingRecord, getLinkedEmail, isPlusActive } from '../../features/billing/billing'
import { getRedis, PRICE_DROPS_KEY, WATCH_KEY } from '../../features/alerts/waitlistStore'
import { addPriceDrop, MAX_PRICE_DROPS, parsePriceDropEntry, removePriceDrop } from '../../features/alerts/priceDrops'
import { parseWatchEntry } from '../../features/alerts/titleAlerts'
import { rejectBot } from '../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'

// Plus-only: every weekly check is a real Watchmode credit, so this endpoint
// can never mint a free-tier subscription.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'price_alerts_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) return res.status(403).json({ error: 'Invalid credentials' })
  if (!isPlusActive(await getBillingRecord(email))) {
    return res.status(403).json({ error: 'Galaxy Plus is required', code: 'plus-required' })
  }

  const kv = getRedis()
  if (!kv) return res.status(503).json({ error: 'Service unavailable' })

  if (req.method === 'GET') {
    const entry = parsePriceDropEntry(await kv.hget(PRICE_DROPS_KEY, email))
    return res.status(200).json({ targets: entry?.targets || [], max: MAX_PRICE_DROPS })
  }

  const action = String(req.body?.action || 'add')
  const tmdbId = Number(req.body?.tmdbId)
  const tmdbType = req.body?.tmdbType === 'tv' ? 'tv' : 'movie'
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: 'Invalid title' })

  if (action === 'remove') {
    await removePriceDrop(kv, email, tmdbId, tmdbType)
    const entry = parsePriceDropEntry(await kv.hget(PRICE_DROPS_KEY, email))
    return res.status(200).json({ targets: entry?.targets || [], max: MAX_PRICE_DROPS })
  }

  const title = String(req.body?.title || '').trim().slice(0, 200)
  if (!title) return res.status(400).json({ error: 'Invalid title' })

  const { added, count } = await addPriceDrop(kv, email, { tmdbId, tmdbType, title })
  if (!added && count >= MAX_PRICE_DROPS) {
    return res.status(409).json({ error: `You can track up to ${MAX_PRICE_DROPS} titles`, code: 'limit' })
  }

  // Price-drop emails reuse the title-watch unsubscribe token — mint one now
  // so a price-alert-only subscriber still has a working opt-out.
  const watch = parseWatchEntry(await kv.hget(WATCH_KEY, email))
  if (!watch?.unsub) {
    await kv.hset(WATCH_KEY, { [email]: { unsub: randomUUID(), titles: watch?.titles || [], services: watch?.services } })
  }

  const entry = parsePriceDropEntry(await kv.hget(PRICE_DROPS_KEY, email))
  return res.status(200).json({ targets: entry?.targets || [], max: MAX_PRICE_DROPS })
}
