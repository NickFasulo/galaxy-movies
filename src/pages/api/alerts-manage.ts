import type { NextApiRequest, NextApiResponse } from 'next'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../features/billing/billing'
import {
  ALERTS_PREFS_KEY, CONFIRMED_KEY, getRedis, PRICE_DROPS_KEY, WATCH_KEY
} from '../../features/alerts/waitlistStore'
import { parseWatchEntry, type WatchEntry } from '../../features/alerts/titleAlerts'
import { parsePriceDropEntry, removePriceDrop, type PriceDropTarget } from '../../features/alerts/priceDrops'
import type { SyncedPrefs } from '../../lib/userData'
import { rejectBot } from '../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import { SITE_URL } from '../../lib/site'

interface ManageResponse {
  prefs: SyncedPrefs | null
  watch: WatchEntry | null
  priceDrops: PriceDropTarget[]
  plus: boolean
  // Full-unsubscribe URL for the digest list; null when the email never
  // confirmed it — title-watch entries carry their own unsub on each record.
  unsubUrl: string | null
}

async function loadManage(email: string): Promise<ManageResponse> {
  const kv = getRedis()
  if (!kv) return { prefs: null, watch: null, priceDrops: [], plus: false, unsubUrl: null }
  const [prefs, watchRaw, dropsRaw, confirmedToken, billing] = await Promise.all([
    kv.hget<SyncedPrefs>(ALERTS_PREFS_KEY, email),
    kv.hget(WATCH_KEY, email),
    kv.hget(PRICE_DROPS_KEY, email),
    kv.hget<string>(CONFIRMED_KEY, email),
    getBillingRecord(email)
  ])
  const watch = parseWatchEntry(watchRaw)
  return {
    prefs: prefs && typeof prefs === 'object' ? prefs : null,
    watch: watch && watch.titles.length ? watch : null,
    priceDrops: parsePriceDropEntry(dropsRaw)?.targets || [],
    plus: isPlusActive(billing),
    unsubUrl: confirmedToken
      ? `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${confirmedToken}`
      : null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'alerts_manage_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) return res.status(403).json({ error: 'Invalid credentials' })

  const kv = getRedis()
  if (!kv) return res.status(503).json({ error: 'Service unavailable' })

  if (req.method === 'POST') {
    const action = String(req.body?.action || '')
    const tmdbId = Number(req.body?.tmdbId)
    const tmdbType = req.body?.tmdbType === 'tv' ? 'tv' : 'movie'
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) return res.status(400).json({ error: 'Invalid title' })

    if (action === 'remove-pricedrop') {
      await removePriceDrop(kv, email, tmdbId, tmdbType)
      return res.status(200).json(await loadManage(email))
    }
    if (action !== 'remove-watch') return res.status(400).json({ error: 'Unknown action' })

    const entry = parseWatchEntry(await kv.hget(WATCH_KEY, email))
    if (entry) {
      const titles = entry.titles.filter((t) => !(t.tmdbId === tmdbId && t.tmdbType === tmdbType))
      if (titles.length) {
        await kv.hset(WATCH_KEY, { [email]: { ...entry, titles } })
      } else {
        await kv.hdel(WATCH_KEY, email)
      }
    }
    return res.status(200).json(await loadManage(email))
  }

  return res.status(200).json(await loadManage(email))
}
