import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkDistributedRateLimit, checkGlobalBudget, getClientIP, isBot, isPreviewBot, isSearchEngine } from './rateLimiter'
import { getRedis } from './redis'

vi.mock('./redis', () => ({ getRedis: vi.fn(() => null) }))
const mockGetRedis = vi.mocked(getRedis)

describe('isBot', () => {
  it('treats a missing user agent as a bot', () => {
    expect(isBot(undefined)).toBe(true)
    expect(isBot(null)).toBe(true)
  })

  it.each([
    'curl/8.0',
    'python-requests/2.31',
    'HeadlessChrome/120.0',
    'AhrefsBot/7.0',
    // HTTP client libraries — the default UAs most scrapers never change.
    'axios/1.7.2',
    'okhttp/4.12.0',
    'python-httpx/0.27.0',
    'Scrapy/2.11.0 (+https://scrapy.org)',
    'PostmanRuntime/7.32.3',
    'Go-http-client/1.1',
    'Dart/3.4 (dart:io)'
  ])('rejects %s', (ua) => expect(isBot(ua)).toBe(true))

  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'bingbot/2.0',
    'Chrome-Lighthouse',
    'Discordbot/2.0'
  ])('allows %s', (ua) => expect(isBot(ua)).toBe(false))
})

describe('isSearchEngine', () => {
  it.each(['Googlebot/2.1', 'bingbot/2.0', 'DuckDuckBot/1.1'])('identifies %s', (ua) =>
    expect(isSearchEngine(ua)).toBe(true)
  )

  it.each(['Twitterbot/1.0', 'Discordbot/2.0', 'Mozilla/5.0'])(
    'excludes social/preview agents like %s',
    (ua) => expect(isSearchEngine(ua)).toBe(false)
  )

  it('returns false for a missing user agent', () => {
    expect(isSearchEngine(undefined)).toBe(false)
  })
})

describe('isPreviewBot', () => {
  it.each([
    'facebookexternalhit/1.1',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0',
    'Discordbot/2.0',
    'LinkedInBot/1.0',
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.23'
  ])('identifies %s', (ua) => expect(isPreviewBot(ua)).toBe(true))

  it.each(['Googlebot/2.1', 'bingbot/2.0', 'DuckDuckBot/1.1'])(
    'excludes search engine %s — their crawls index shared content',
    (ua) => expect(isPreviewBot(ua)).toBe(false)
  )

  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    'curl/8.0',
    'AhrefsBot/7.0',
    undefined,
    null
  ])('excludes %j', (ua) => expect(isPreviewBot(ua)).toBe(false))
})

describe('getClientIP', () => {
  it('prefers x-vercel-forwarded-for, first entry', () => {
    expect(getClientIP({ headers: { 'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4')
  })

  it('trusts only the last x-forwarded-for entry', () => {
    expect(getClientIP({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' } })).toBe('2.2.2.2')
  })

  it('reads Headers instances for edge requests', () => {
    expect(getClientIP({ headers: new Headers({ 'x-forwarded-for': '3.3.3.3' }) })).toBe('3.3.3.3')
  })

  it('falls back to the socket address, then unknown', () => {
    expect(getClientIP({ headers: {}, socket: { remoteAddress: '9.9.9.9' } })).toBe('9.9.9.9')
    expect(getClientIP({ headers: {} })).toBe('unknown')
  })

  describe('on workerd', () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

    afterEach(() => {
      if (navigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
      } else {
        delete (globalThis as Record<string, unknown>).navigator
      }
    })

    function stubWorkerd() {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: { userAgent: 'Cloudflare-Workers' }
      })
    }

    it('trusts cf-connecting-ip over a client-injected x-vercel-forwarded-for', () => {
      stubWorkerd()
      expect(
        getClientIP({
          headers: { 'cf-connecting-ip': '8.8.8.8', 'x-vercel-forwarded-for': '1.2.3.4' }
        })
      ).toBe('8.8.8.8')
    })

    it('ignores x-vercel-forwarded-for entirely', () => {
      stubWorkerd()
      expect(
        getClientIP({ headers: { 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' } })
      ).toBe('9.9.9.9')
    })
  })
})

describe('checkDistributedRateLimit', () => {
  afterEach(() => {
    mockGetRedis.mockReturnValue(null)
  })

  it('buckets IPv6 clients into their /64 prefix', async () => {
    const opts = { keyPrefix: 'v6_rl', maxRequests: 2, windowSeconds: 60 }
    await expect(checkDistributedRateLimit('2a13:f47:fb13:dacb:aaaa', opts)).resolves.toBe(true)
    await expect(checkDistributedRateLimit('2a13:f47:fb13:dacb:bbbb', opts)).resolves.toBe(true)
    // Third distinct address in the same /64 shares their bucket
    await expect(checkDistributedRateLimit('2a13:f47:fb13:dacb:cccc', opts)).resolves.toBe(false)
    // A neighboring /64 gets its own
    await expect(checkDistributedRateLimit('2a13:f47:fb13:dacc:dddd', opts)).resolves.toBe(true)
  })

  it('buckets compressed IPv6 addresses into their /64 prefix', async () => {
    const opts = { keyPrefix: 'v6c_rl', maxRequests: 2, windowSeconds: 60 }
    await expect(checkDistributedRateLimit('2001:db8::1', opts)).resolves.toBe(true)
    await expect(checkDistributedRateLimit('2001:db8::2', opts)).resolves.toBe(true)
    // `::` must expand before truncation — before the fix these rotated
    // addresses each minted their own bucket.
    await expect(checkDistributedRateLimit('2001:db8::3', opts)).resolves.toBe(false)
    // Mixed compressed/expanded spellings of the same /64 also share.
    await expect(checkDistributedRateLimit('2001:db8:0:0::4', opts)).resolves.toBe(false)
    await expect(checkDistributedRateLimit('2001:db9::1', opts)).resolves.toBe(true)
  })

  it('buckets IPv6 loopback-style addresses without crashing', async () => {
    const opts = { keyPrefix: 'v6l_rl', maxRequests: 1, windowSeconds: 60 }
    await expect(checkDistributedRateLimit('::1', opts)).resolves.toBe(true)
    await expect(checkDistributedRateLimit('::ffff:10.0.0.1', opts)).resolves.toBe(true)
  })

  it('leaves IPv4 and non-IP client ids alone', async () => {
    const opts = { keyPrefix: 'v4_rl', maxRequests: 1, windowSeconds: 60 }
    await expect(checkDistributedRateLimit('1.2.3.4', opts)).resolves.toBe(true)
    await expect(checkDistributedRateLimit('1.2.3.5', opts)).resolves.toBe(true)
  })
})

describe('checkGlobalBudget', () => {
  afterEach(() => {
    mockGetRedis.mockReturnValue(null)
  })

  it('stops re-checking Redis once a budget trips', async () => {
    const evalMock = vi.fn(async () => 99)
    mockGetRedis.mockReturnValue({ eval: evalMock } as unknown as ReturnType<typeof getRedis>)

    const opts = { maxRequests: 5, windowSeconds: 3600 }
    await expect(checkGlobalBudget('flood_test', opts)).resolves.toBe(false)
    await expect(checkGlobalBudget('flood_test', opts)).resolves.toBe(false)
    await expect(checkGlobalBudget('flood_test', opts)).resolves.toBe(false)
    expect(evalMock).toHaveBeenCalledTimes(1)
  })
})
