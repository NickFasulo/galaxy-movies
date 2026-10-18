import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/core/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/core/rateLimiter'
import { getBillingRecord, getLinkedEmail, isPlusActive } from '../../../utils/billing/billing'
import { getRedis, TRAKT_KEY, SHARE_KEY, DISCORD_KEY, TELEGRAM_KEY } from '../../../utils/alerts/waitlistStore'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'billing_status_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) {
    return res.status(403).json({ error: 'Invalid sync credentials' })
  }

  const record = await getBillingRecord(email)
  if (!isPlusActive(record)) {
    return res.status(200).json({ entitlement: 'free' })
  }

  // Perk state rides along so the Plus UI doesn't fan out extra requests.
  const kv = getRedis()
  const [trakt, share, discordWebhook, telegramChatId] = kv
    ? await Promise.all([
        kv.hget(TRAKT_KEY, email).catch(() => null),
        kv.hget<string>(SHARE_KEY, email).catch(() => null),
        kv.hget<string>(DISCORD_KEY, email).catch(() => null),
        kv.hget<string>(TELEGRAM_KEY, email).catch(() => null)
      ])
    : [null, null, null, null]

  return res.status(200).json({
    entitlement: 'plus',
    traktConnected: Boolean(trakt),
    shareId: share || null,
    discordWebhook: discordWebhook || null,
    telegramConnected: Boolean(telegramChatId)
  })
}
