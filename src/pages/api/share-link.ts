import type { NextApiRequest, NextApiResponse } from 'next'
import { randomUUID } from 'crypto'
import { requireMethod, rejectBot } from '../../utils/core/api'
import { getClientIP, checkDistributedRateLimit } from '../../utils/core/rateLimiter'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../utils/billing/billing'
import { getRedis, SHARE_KEY, SHARE_LOOKUP_KEY } from '../../utils/alerts/waitlistStore'
import { SITE_URL } from '../../utils/core/site'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, ['POST', 'DELETE'])) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'share_link_rl',
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
    return res.status(403).json({ error: 'Galaxy Plus is required for sharing.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Sharing is temporarily unavailable.' })
  }

  try {
    if (req.method === 'DELETE') {
      const shareId = await kv.hget<string>(SHARE_KEY, email)
      if (shareId) {
        await kv.hdel(SHARE_KEY, email)
        await kv.hdel(SHARE_LOOKUP_KEY, shareId)
      }
      return res.status(200).json({ ok: true })
    }

    const existing = await kv.hget<string>(SHARE_KEY, email)
    if (existing) {
      return res.status(200).json({ share: `${SITE_URL}/list/${existing}` })
    }
    const shareId = randomUUID()
    await kv.hset(SHARE_KEY, { [email]: shareId })
    await kv.hset(SHARE_LOOKUP_KEY, { [shareId]: email })
    return res.status(200).json({ share: `${SITE_URL}/list/${shareId}` })
  } catch (err) {
    console.error('Share link error:', err)
    return res.status(500).json({ error: 'Could not update sharing.' })
  }
}
