import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'
import { SITE_URL } from '../../lib/site'

const mocks = vi.hoisted(() => ({
  getLinkedEmail: vi.fn<() => Promise<string | null>>(async () => null),
  traktConfigured: vi.fn<() => boolean>(() => true),
  authorizeUrl: vi.fn<(redirectUri: string, state: string) => string>(
    (redirectUri, state) => `https://trakt.tv/oauth/authorize?redirect=${encodeURIComponent(redirectUri)}&state=${state}`),
  signState: vi.fn<(email: string, key: string) => string>((email, key) => `sig:${email}:${key}`)
}))

vi.mock('../../features/billing/billing', () => ({ getLinkedEmail: mocks.getLinkedEmail }))
vi.mock('../../features/billing/trakt', () => ({
  authorizeUrl: mocks.authorizeUrl,
  signState: mocks.signState,
  traktConfigured: mocks.traktConfigured
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/trakt/connect'

beforeEach(() => {
  resetFakeRedis()
  mocks.traktConfigured.mockReturnValue(true)
  mocks.getLinkedEmail.mockResolvedValue('user@example.com')
})

describe('GET /api/trakt/connect', () => {
  it('rejects non-GET and bot requests', async () => {
    const post = makeRes()
    await handler(makeReq({ method: 'POST' }), post)
    expect(post.statusCode).toBe(405)

    const bot = makeRes()
    await handler(makeReq({ ua: 'curl/8.0' }), bot)
    expect(bot.statusCode).toBe(403)
  })

  it('503s when Trakt is not configured', async () => {
    mocks.traktConfigured.mockReturnValue(false)
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(503)
    expect(mocks.getLinkedEmail).not.toHaveBeenCalled()
  })

  it('403s when the sync credentials are not linked', async () => {
    mocks.getLinkedEmail.mockResolvedValue(null)
    const res = makeRes()
    await handler(makeReq({ query: { key: 'abc' } }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.authorizeUrl).not.toHaveBeenCalled()
  })

  it('redirects to the Trakt authorize URL with a signed state', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { key: 'synckey' } }), res)
    expect(mocks.signState).toHaveBeenCalledWith('user@example.com', 'synckey')
    expect(mocks.authorizeUrl).toHaveBeenCalledWith(`${SITE_URL}/api/trakt/callback`, 'sig:user@example.com:synckey')
    expect(res.redirectTo?.url).toContain('trakt.tv/oauth/authorize')
    expect(res.redirectTo?.url).toContain(encodeURIComponent(`${SITE_URL}/api/trakt/callback`))
  })

  it('defaults the key to an empty string when omitted', async () => {
    const res = makeRes()
    await handler(makeReq(), res)
    expect(mocks.signState).toHaveBeenCalledWith('user@example.com', '')
  })

  it('per-IP rate limit trips at 30 attempts per hour', async () => {
    fakeRedis.map.set('trakt_rl:10.0.0.3', 30)
    const res = makeRes()
    await handler(makeReq({ ip: '10.0.0.3' }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.getLinkedEmail).not.toHaveBeenCalled()
  })
})
