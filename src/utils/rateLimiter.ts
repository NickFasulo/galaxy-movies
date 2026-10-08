import { LRUCache } from 'lru-cache'
import type { IncomingHttpHeaders } from 'http'
import { getRedis } from './redis'

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
  /mitgo/i,
  /chrome-lighthouse/i
]

interface RateEntry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  maxRequests: number
  windowSeconds: number
  cost?: number
}

type RateLimitRequest =
  | { headers: Headers; socket?: undefined }
  | { headers: IncomingHttpHeaders; socket?: { remoteAddress?: string } }

const distributedFallbackCounts = new LRUCache<string, RateEntry>({ max: 10000, ttl: 1000 * 60 * 60 })

// Indexing crawlers, a subset of ALLOWED_BOT_PATTERNS. Social/preview bots are
// excluded on purpose — they don't index, so detail pages don't owe them the
// shared-cache reads that each cost a billed Redis command.
const SEARCH_ENGINE_PATTERNS = [/googlebot/i, /bingbot/i, /duckduckbot/i, /slurp/i]

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true

  const ua = userAgent.toLowerCase()
  if (ALLOWED_BOT_PATTERNS.some(pattern => pattern.test(ua))) return false
  return BOT_PATTERNS.some(pattern => pattern.test(ua))
}

export function isSearchEngine(userAgent: string | null | undefined): boolean {
  const ua = (userAgent || '').toLowerCase()
  return SEARCH_ENGINE_PATTERNS.some((pattern) => pattern.test(ua))
}

// Node API routes expose headers as a plain object, edge routes as a Headers instance.
function readHeader(req: RateLimitRequest, name: string): string | undefined {
  const { headers } = req
  const value = typeof (headers as Headers).get === 'function'
    ? (headers as Headers).get(name)
    : (headers as IncomingHttpHeaders)[name]
  return (Array.isArray(value) ? value[0] : value) ?? undefined
}

// Clients can inject their own leading x-forwarded-for entries, so only the
// last entry (added by the edge) is trusted; x-vercel-* headers can't be spoofed.
export function getClientIP(req: RateLimitRequest): string {
  const vercelForwarded = readHeader(req, 'x-vercel-forwarded-for')?.split(',')[0].trim()
  if (vercelForwarded) return vercelForwarded

  const forwardedFor = readHeader(req, 'x-forwarded-for')
  if (forwardedFor) {
    const last = forwardedFor.split(',').pop()?.trim()
    if (last) return last
  }

  return readHeader(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown'
}

function checkMemoryRateLimit(key: string, { maxRequests, windowSeconds }: RateLimitOptions, cost: number): boolean {
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
// Upstash bills per command, so the INCRBY + conditional EXPIRE + recovery TTL
// check run as one Lua script — a single EVAL is billed once no matter how many
// redis.call()s it makes. A fresh key (count <= cost) gets its window set, and
// a blocked client re-checks TTL so a key that lost its expiry can't 429 forever.
const INCR_WITH_WINDOW_LUA = `
local count = redis.call("INCRBY", KEYS[1], ARGV[1])
if count <= tonumber(ARGV[1]) then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
elseif count > tonumber(ARGV[3]) and redis.call("TTL", KEYS[1]) < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return count
`

export async function checkDistributedRateLimit(
  clientId: string,
  { keyPrefix, maxRequests, windowSeconds, cost = 1 }: RateLimitOptions & { keyPrefix: string }
): Promise<boolean> {
  const key = `${keyPrefix}:${clientId}`
  const kv = getRedis()

  if (kv) {
    try {
      const count = await kv.eval<[number, number, number], number>(INCR_WITH_WINDOW_LUA, [key], [cost, windowSeconds, maxRequests])
      return count <= maxRequests
    } catch (err) {
      console.error('Redis rate limit error, using in-memory fallback:', err)
    }
  }

  return checkMemoryRateLimit(key, { maxRequests, windowSeconds }, cost)
}

export function checkGlobalBudget(name: string, { maxRequests, windowSeconds, cost }: RateLimitOptions): Promise<boolean> {
  return checkDistributedRateLimit('all', { keyPrefix: `global_rl:${name}`, maxRequests, windowSeconds, cost })
}
