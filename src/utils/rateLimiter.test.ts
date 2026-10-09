import { describe, expect, it } from 'vitest'
import { getClientIP, isBot, isSearchEngine } from './rateLimiter'

describe('isBot', () => {
  it('treats a missing user agent as a bot', () => {
    expect(isBot(undefined)).toBe(true)
    expect(isBot(null)).toBe(true)
  })

  it.each(['curl/8.0', 'python-requests/2.31', 'HeadlessChrome/120.0', 'AhrefsBot/7.0'])(
    'rejects %s',
    (ua) => expect(isBot(ua)).toBe(true)
  )

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
})
