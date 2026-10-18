import type { NextApiRequest, NextApiResponse } from 'next'
import { rejectBot } from '../../../lib/api'
import { getRedis } from '../../../lib/redis'
import { TELEGRAM_KEY } from '../../../features/alerts/waitlistStore'
import { getClientIP, checkDistributedRateLimit } from '../../../lib/rateLimiter'
import { randomUUID } from 'crypto'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../../features/billing/billing'
import { getBotUsername } from '../../../features/alerts/telegram'

// The deep-link token can't embed the creds (Telegram caps ?start= at 64
// chars), so the token is a random key into a 1h record the webhook resolves.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (rejectBot(req, res)) return

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Telegram alerts are temporarily unavailable.' })
  }

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'tglink_rl',
    maxRequests: 30,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email || !isPlusActive(await getBillingRecord(email))) {
    return res.status(403).json({ error: 'Galaxy Plus is required for Telegram alerts.' })
  }

  if (req.method === 'DELETE') {
    await kv.hdel(TELEGRAM_KEY, email)
    return res.status(200).json({ disconnected: true })
  }

  const username = await getBotUsername()
  if (!username) {
    return res.status(503).json({ error: 'Telegram alerts are temporarily unavailable.' })
  }

  const token = randomUUID()
  await kv.set(`tglink:${token}`, { email }, { ex: 60 * 60 })
  res.status(200).json({ url: `https://t.me/${username}?start=${token}` })
}
