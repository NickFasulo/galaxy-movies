const { LRUCache } = require('lru-cache')

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

const requestCounts = new LRUCache({ max: 10000, ttl: 1000 * 60 * 60 })
const blockedIPs = new LRUCache({ max: 1000, ttl: 1000 * 60 * 60 * 24 })

const RATE_LIMITS = {
  default: { requests: 100, window: 60 * 60 * 1000 },
  api: { requests: 50, window: 60 * 60 * 1000 },
  strict: { requests: 20, window: 60 * 60 * 1000 }
}

function isBot(userAgent) {
  if (!userAgent) return true
  
  const ua = userAgent.toLowerCase()
  return BOT_PATTERNS.some(pattern => pattern.test(ua))
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.socket.remoteAddress ||
         'unknown'
}

function checkRateLimit(ip, limitType = 'default') {
  if (blockedIPs.has(ip)) {
    return { allowed: false, reason: 'IP blocked' }
  }
  
  const limit = RATE_LIMITS[limitType] || RATE_LIMITS.default
  const now = Date.now()
  const key = `${ip}_${limitType}`
  
  const record = requestCounts.get(key) || { count: 0, resetTime: now + limit.window }
  
  if (now > record.resetTime) {
    record.count = 0
    record.resetTime = now + limit.window
  }
  
  record.count++
  requestCounts.set(key, record)
  
  if (record.count > limit.requests) {
    if (record.count > limit.requests * 2) {
      blockedIPs.set(ip, true)
    }
    return { 
      allowed: false, 
      reason: 'Rate limit exceeded',
      resetTime: record.resetTime
    }
  }
  
  return { allowed: true, remaining: limit.requests - record.count }
}

function blockIP(ip, duration = 1000 * 60 * 60 * 24) {
  blockedIPs.set(ip, true)
}

function middleware(options = {}) {
  const { limitType = 'default', blockBots = true } = options
  
  return function(req, res, next) {
    const ip = getClientIP(req)
    const userAgent = req.headers['user-agent']
    
    if (blockBots && isBot(userAgent)) {
      return res.status(403).json({ error: 'Bot access denied' })
    }
    
    const rateLimitResult = checkRateLimit(ip, limitType)
    
    if (!rateLimitResult.allowed) {
      res.setHeader('Retry-After', Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000))
      return res.status(429).json({ 
        error: rateLimitResult.reason,
        resetTime: rateLimitResult.resetTime
      })
    }
    
    res.setHeader('X-RateLimit-Limit', RATE_LIMITS[limitType].requests)
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining)
    
    next()
  }
}

module.exports = {
  isBot,
  getClientIP,
  checkRateLimit,
  blockIP,
  middleware
}