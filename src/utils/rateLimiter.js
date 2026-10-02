const { LRUCache } = require('lru-cache')
const { Redis } = require('@upstash/redis')

const BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python/i,
  /java/i,
  /go-http-client/i,
  /headless/i,
  /phantom/i,
  /selenium/i,
  /chromedriver/i,
  /geckodriver/i
]

// Legit crawlers let through even though their UA matches BOT_PATTERNS: search
// engines (in case any page ever fetches client-side during render) and social
// link-preview bots. Trivially spoofable — real verification happens at the edge.
const ALLOWED_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /duckduckbot/i,
  /slurp/i,
  /facebookexternalhit|facebot/i,
  /twitterbot/i,
  /slackbot/i,
  /discordbot/i,
  /linkedinbot/i,
  /telegrambot/i,
  /whatsapp/i,
  /mitgo/i
]

const distributedFallbackCounts = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 })

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

function isBot(userAgent) {
  if (!userAgent) return true

  const ua = userAgent.toLowerCase()
  if (ALLOWED_BOT_PATTERNS.some(pattern => pattern.test(ua))) return false
  return BOT_PATTERNS.some(pattern => pattern.test(ua))
}

// Clients can inject their own leading x-forwarded-for entries, so only the
// last entry (added by the edge) is trusted; x-vercel-* headers can't be spoofed.
function getClientIP(req) {
  const vercelForwarded = req.headers['x-vercel-forwarded-for']
  if (vercelForwarded) {
    return (Array.isArray(vercelForwarded) ? vercelForwarded[0] : vercelForwarded).split(',')[0].trim()
  }

  const forwardedFor = req.headers['x-forwarded-for']
  if (forwardedFor) {
    const parts = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',')
    return parts[parts.length - 1].trim()
  }

  return req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown'
}

async function checkDistributedRateLimit(clientId, { keyPrefix, maxRequests, windowSeconds }) {
  const key = `${keyPrefix}:${clientId}`
  const kv = getRedis()

  if (kv) {
    try {
      const count = await kv.incr(key)
      if (count === 1) {
        await kv.expire(key, windowSeconds)
      }
      return count <= maxRequests
    } catch (err) {
      console.error('Redis rate limit error, failing open:', err)
      return true
    }
  }

  const count = (distributedFallbackCounts.get(key) || 0) + 1
  distributedFallbackCounts.set(key, count)
  return count <= maxRequests
}

module.exports = {
  isBot,
  getClientIP,
  checkDistributedRateLimit
}