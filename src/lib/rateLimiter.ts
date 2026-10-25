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
  /geckodriver/i,
  // HTTP client libraries — scrapers that don't bother spoofing a browser UA.
  /axios/i,
  /okhttp/i,
  /httpx/i,
  /aiohttp/i,
  /node-fetch/i,
  /undici/i,
  /scrapy/i,
  /postman/i,
  /insomnia/i,
  /reqwest/i,
  /got\//i,
  /libwww/i,
  /httpie/i,
  /restsharp/i,
  /mechanize/i,
  /php/i,
  /perl/i,
  /ruby/i,
  /dart\//i
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

// Link-preview/social bots pass isBot (they sit in ALLOWED_BOT_PATTERNS) but
// aren't indexers — detail pages use this to keep them off shared-cache reads
// without paying a billed Redis command per preview crawl.
export function isPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return ALLOWED_BOT_PATTERNS.some((pattern) => pattern.test(ua)) && !isSearchEngine(ua)
}

// Node API routes expose headers as a plain object, edge routes as a Headers instance.
function readHeader(req: RateLimitRequest, name: string): string | undefined {
  const { headers } = req
  const value = typeof (headers as Headers).get === 'function'
    ? (headers as Headers).get(name)
    : (headers as IncomingHttpHeaders)[name]
  return (Array.isArray(value) ? value[0] : value) ?? undefined
}

// The trusted edge IP header is platform-specific: Cloudflare always sets and
// overwrites cf-connecting-ip, while x-vercel-forwarded-for is only genuine
// when Vercel's edge wrote it — on workerd it's just another client header and
// would let callers mint a fresh rate-limit bucket per request, so it must not
// be consulted there. x-forwarded-for clients can inject their own leading
// entries, so only the last entry (appended by the edge) is trusted.
export function getClientIP(req: RateLimitRequest): string {
  const onWorkerd = globalThis.navigator?.userAgent === 'Cloudflare-Workers'
  const edgeIp = onWorkerd
    ? readHeader(req, 'cf-connecting-ip')
    : readHeader(req, 'x-vercel-forwarded-for')?.split(',')[0].trim()
  if (edgeIp) return edgeIp

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

// IPv6 clients rotate addresses inside their delegated prefix — privacy
// extensions do it per-user, and scrapers do it across whole allocations —
// so buckets key on the /64 a customer is normally assigned, not the
// individual address. Anything wider evades per-IP caps entirely.
function rateLimitSubject(clientId: string): string {
  // IPv4 (and v4-mapped ::ffff:a.b.c.d) keeps its exact address — folding it
  // into a v6 prefix would merge unrelated clients into one bucket.
  if (!clientId.includes(':') || clientId.includes('.')) return clientId
  // `::` must be expanded into zero hextets before truncation — the raw first
  // four segments of a compressed address are position-dependent, so rotated
  // hosts like 2001:db8::1 and 2001:db8::2 would otherwise land in different
  // buckets and slip the cap.
  const [head, ...tails] = clientId.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tails.length ? tails.join(':').split(':').filter(Boolean) : []
  const hextets = tails.length
    ? [...headParts, ...new Array(Math.max(8 - headParts.length - tailParts.length, 1)).fill('0'), ...tailParts]
    : headParts
  if (hextets.length < 4) return clientId
  return `${hextets.slice(0, 4).join(':')}:`
}

export async function checkDistributedRateLimit(
  clientId: string,
  { keyPrefix, maxRequests, windowSeconds, cost = 1 }: RateLimitOptions & { keyPrefix: string }
): Promise<boolean> {
  const key = `${keyPrefix}:${rateLimitSubject(clientId)}`
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

// A tripped global budget can't untrip until its window resets, but every
// re-check is a billed Redis command — under a distributed flood, the
// re-checks themselves are the billed traffic. Remember trips per isolate
// and re-verify at most once a minute. isGlobalBudgetTripped lets callers
// short-circuit before spending any Redis commands on a doomed request.
const trippedGlobalBudgets = new Map<string, number>()
const GLOBAL_TRIP_RECHECK_MS = 60_000

export function isGlobalBudgetTripped(name: string): boolean {
  const recheckAt = trippedGlobalBudgets.get(name)
  return Boolean(recheckAt && recheckAt > Date.now())
}

export async function checkGlobalBudget(name: string, options: RateLimitOptions): Promise<boolean> {
  if (isGlobalBudgetTripped(name)) return false
  const allowed = await checkDistributedRateLimit('all', { keyPrefix: `global_rl:${name}`, ...options })
  if (allowed) trippedGlobalBudgets.delete(name)
  else trippedGlobalBudgets.set(name, Date.now() + GLOBAL_TRIP_RECHECK_MS)
  return allowed
}

// Public digest endpoints the Devvit apps poll on a schedule — rate-limited,
// but deliberately no UA check: those callers aren't browsers. The cap is high
// because every install's cron fires at the same minute through Reddit's few
// shared egress IPs — per-IP limiting would starve installs, not abuse.
export function checkPublicDigestLimit(req: RateLimitRequest): Promise<boolean> {
  return checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'public_digest_rl',
    maxRequests: 1500,
    windowSeconds: 60 * 60
  })
}
