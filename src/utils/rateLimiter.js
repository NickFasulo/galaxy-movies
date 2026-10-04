const { LRUCache } = require('lru-cache')
const { getRedis } = require('./redis')

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

function isBot(userAgent) {
  if (!userAgent) return true

  const ua = userAgent.toLowerCase()
  if (ALLOWED_BOT_PATTERNS.some(pattern => pattern.test(ua))) return false
  return BOT_PATTERNS.some(pattern => pattern.test(ua))
}

// Node API routes expose headers as a plain object, edge routes as a Headers instance.
function readHeader(req, name) {
  const value = typeof req.headers.get === 'function' ? req.headers.get(name) : req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

// Clients can inject their own leading x-forwarded-for entries, so only the
// last entry (added by the edge) is trusted; x-vercel-* headers can't be spoofed.
function getClientIP(req) {
  const vercelForwarded = readHeader(req, 'x-vercel-forwarded-for')
  if (vercelForwarded) return vercelForwarded.split(',')[0].trim()

  const forwardedFor = readHeader(req, 'x-forwarded-for')
  if (forwardedFor) {
    const parts = forwardedFor.split(',')
    return parts[parts.length - 1].trim()
  }

  return readHeader(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown'
}

function checkMemoryRateLimit(key, { maxRequests, windowSeconds }, cost) {
  const now = Date.now()
  const entry = distributedFallbackCounts.get(key)
  const next = entry && entry.resetAt > now
    ? { count: entry.count + cost, resetAt: entry.resetAt }
    : { count: cost, resetAt: now + windowSeconds * 1000 }
  distributedFallbackCounts.set(key, next, { ttl: windowSeconds * 1000 })
  return next.count <= maxRequests
}

// Redis errors degrade to a per-instance limiter instead of failing open, so a
// Redis outage can't be used to run up OpenAI/Watchmode spend.
async function checkDistributedRateLimit(clientId, { keyPrefix, maxRequests, windowSeconds, cost = 1 }) {
  const key = `${keyPrefix}:${clientId}`
  const kv = getRedis()

  if (kv) {
    try {
      const [count, ttl] = await kv.pipeline().incrby(key, cost).ttl(key).exec()
      if (ttl < 0) await kv.expire(key, windowSeconds)
      return count <= maxRequests
    } catch (err) {
      console.error('Redis rate limit error, using in-memory fallback:', err)
    }
  }

  return checkMemoryRateLimit(key, { maxRequests, windowSeconds }, cost)
}

function checkGlobalBudget(name, { maxRequests, windowSeconds, cost }) {
  return checkDistributedRateLimit('all', { keyPrefix: `global_rl:${name}`, maxRequests, windowSeconds, cost })
}

module.exports = {
  isBot,
  getClientIP,
  checkDistributedRateLimit,
  checkGlobalBudget
}
