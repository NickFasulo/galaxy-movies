const { Redis } = require('@upstash/redis')
const { isBot, getClientIP, checkDistributedRateLimit } = require('../../utils/rateLimiter')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WAITLIST_KEY = 'gm:waitlist'

let redis
function getRedis() {
  if (redis) return redis
  if (!process.env.UPSTASH_REDIS_KV_REST_API_URL || !process.env.UPSTASH_REDIS_KV_REST_API_TOKEN) {
    return null
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_KV_REST_API_TOKEN,
  })
  return redis
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  if (isBot(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Bot access denied' })
  }

  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Valid email address required' })
  }

  const clientId = getClientIP(req)
  const allowed = await checkDistributedRateLimit(clientId, {
    keyPrefix: 'waitlist_rl',
    maxRequests: 5,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Waitlist is temporarily unavailable.' })
  }

  try {
    await kv.sadd(WAITLIST_KEY, email)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Waitlist store error:', err)
    return res.status(500).json({ error: 'Could not save your email. Please try again.' })
  }
}
