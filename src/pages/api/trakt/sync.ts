import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/rateLimiter'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../../utils/billing'
import { getRedis, TRAKT_KEY, ALERTS_PREFS_KEY } from '../../../utils/waitlistStore'
import { refreshTokens, syncToTrakt, traktConfigured } from '../../../utils/trakt'
import { traktRedirectUri } from './connect'
import type { SyncedPrefs } from '../../../utils/userData'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  if (!traktConfigured()) {
    return res.status(503).json({ error: 'Trakt sync is temporarily unavailable.' })
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
    return res.status(403).json({ error: 'Galaxy Plus is required for Trakt sync.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Trakt sync is temporarily unavailable.' })
  }

  try {
    const link = await kv.hget<{ refreshToken?: string }>(TRAKT_KEY, email)
    if (!link?.refreshToken) {
      return res.status(409).json({ error: 'Trakt is not connected.', code: 'not_connected' })
    }

    const tokens = await refreshTokens(link.refreshToken, traktRedirectUri)
    if (!tokens?.access_token || !tokens.refresh_token) {
      // Trakt denied the refresh — the link is dead, make the user re-connect.
      await kv.hdel(TRAKT_KEY, email)
      return res.status(409).json({ error: 'Trakt connection expired. Please reconnect.', code: 'not_connected' })
    }
    await kv.hset(TRAKT_KEY, { [email]: { refreshToken: tokens.refresh_token } })

    const prefs = await kv.hget<SyncedPrefs>(ALERTS_PREFS_KEY, email)
    if (!prefs?.watchlist?.length && !prefs?.ratings?.length) {
      return res.status(200).json({ ok: true, synced: { watchlist: 0, ratings: 0 } })
    }

    const ok = await syncToTrakt(tokens.access_token, { watchlist: prefs.watchlist, ratings: prefs.ratings })
    if (!ok) {
      return res.status(502).json({ error: 'Trakt rejected the sync. Please try again.' })
    }
    return res.status(200).json({
      ok: true,
      synced: { watchlist: prefs.watchlist?.length || 0, ratings: prefs.ratings?.length || 0 }
    })
  } catch (err) {
    console.error('Trakt sync error:', err)
    return res.status(500).json({ error: 'Could not sync to Trakt.' })
  }
}
