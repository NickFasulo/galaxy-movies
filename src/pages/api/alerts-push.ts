import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash } from 'crypto'
import { getClientIP, checkDistributedRateLimit } from '../../utils/core/rateLimiter'
import { requireMethod, rejectBot } from '../../utils/core/api'
import { getRedis, SYNCKEY_KEY, PUSH_KEY } from '../../utils/alerts/waitlistStore'
import { safeEqual } from '../../utils/core/auth'
import { parsePushSubscription, parseStoredSubs, mergePushSub, isPushEndpoint } from '../../utils/alerts/webpush'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/
const KEY_PATTERN = /^[0-9a-f-]{36}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, ['POST', 'DELETE'])) return
  if (rejectBot(req, res)) return

  const body = req.body || {}
  const email = String(body.email || '').trim().toLowerCase()
  const key = String(body.key || '')
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !KEY_PATTERN.test(key)) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const clientId = getClientIP(req)
  const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 32)
  const [ipOk, emailOk] = await Promise.all([
    checkDistributedRateLimit(clientId, { keyPrefix: 'alerts_push_rl', maxRequests: 20, windowSeconds: 60 * 60 }),
    checkDistributedRateLimit(emailHash, { keyPrefix: 'alerts_push_email_rl', maxRequests: 20, windowSeconds: 60 * 60 })
  ])
  if (!ipOk || !emailOk) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Push alerts are temporarily unavailable.' })
  }

  try {
    const stored = await kv.hget<string>(SYNCKEY_KEY, email)
    if (!stored || !safeEqual(stored, key)) {
      return res.status(403).json({ error: 'Invalid sync credentials' })
    }

    if (req.method === 'DELETE') {
      const endpoint = body.endpoint
      if (!isPushEndpoint(endpoint)) {
        return res.status(400).json({ error: 'Invalid endpoint' })
      }
      const kept = parseStoredSubs(await kv.hget(PUSH_KEY, email)).filter((s) => s.endpoint !== endpoint)
      if (kept.length) {
        await kv.hset(PUSH_KEY, { [email]: kept })
      } else {
        await kv.hdel(PUSH_KEY, email)
      }
      return res.status(200).json({ ok: true })
    }

    const sub = parsePushSubscription(body.subscription)
    if (!sub) {
      return res.status(400).json({ error: 'Invalid push subscription' })
    }
    const subs = mergePushSub(parseStoredSubs(await kv.hget(PUSH_KEY, email)), sub)
    await kv.hset(PUSH_KEY, { [email]: subs })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Push subscription error:', err)
    return res.status(500).json({ error: 'Could not update push subscription.' })
  }
}
