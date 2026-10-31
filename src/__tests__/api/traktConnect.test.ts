import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'
import { SITE_URL } from '../../lib/site'

const mocks = vi.hoisted(() => ({
  getLinkedEmail: vi.fn<() => Promise<string | null>>(async () => null),
  traktConfigured: vi.fn<() => boolean>(() => true),
  authorizeUrl: vi.fn<(redirectUri: string, state: string, challenge: string) => string>(
    (redirectUri, state, challenge) =>
      `https://auth.trakt.tv/oauth/authorize?redirect=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${challenge}`),
  createPkceSession: vi.fn<(email: string, key: string) => Promise<{ state: string; challenge: string } | null>>(
    async () => ({ state: 'nonce', challenge: 'chal' }))
}))

vi.mock('../../features/billing/billing', () => ({ getLinkedEmail: mocks.getLinkedEmail }))
vi.mock('../../features/billing/trakt', () => ({
  authorizeUrl: mocks.authorizeUrl,
  createPkceSession: mocks.createPkceSession,
  traktConfigured: mocks.traktConfigured
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/trakt/connect'

beforeEach(() => {
  resetFakeRedis()
  mocks.traktConfigured.mockReturnValue(true)
  mocks.getLinkedEmail.mockResolvedValue('user@example.com')
  mocks.createPkceSession.mockResolvedValue({ state: 'nonce', challenge: 'chal' })
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

  it('503s when the PKCE session cannot be stored (no Redis)', async () => {
    mocks.createPkceSession.mockResolvedValue(null)
    const res = makeRes()
    await handler(makeReq({ query: { key: 'synckey' } }), res)
    expect(res.statusCode).toBe(503)
    expect(mocks.authorizeUrl).not.toHaveBeenCalled()
  })

  it('redirects to the Trakt authorize URL with state and code challenge', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { key: 'synckey' } }), res)
    expect(mocks.createPkceSession).toHaveBeenCalledWith('user@example.com', 'synckey')
    expect(mocks.authorizeUrl).toHaveBeenCalledWith(`${SITE_URL}/api/trakt/callback`, 'nonce', 'chal')
    expect(res.redirectTo?.url).toContain('auth.trakt.tv/oauth/authorize')
    expect(res.redirectTo?.url).toContain('code_challenge=chal')
    expect(res.redirectTo?.url).toContain(encodeURIComponent(`${SITE_URL}/api/trakt/callback`))
  })

  it('defaults the key to an empty string when omitted', async () => {
    const res = makeRes()
    await handler(makeReq(), res)
    expect(mocks.createPkceSession).toHaveBeenCalledWith('user@example.com', '')
  })

  it('per-IP rate limit trips at 30 attempts per hour', async () => {
    fakeRedis.map.set('trakt_rl:10.0.0.3', 30)
    const res = makeRes()
    await handler(makeReq({ ip: '10.0.0.3' }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.getLinkedEmail).not.toHaveBeenCalled()
  })
})
