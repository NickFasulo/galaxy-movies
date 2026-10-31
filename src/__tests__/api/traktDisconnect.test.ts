import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'
import { TRAKT_KEY } from '../../features/alerts/waitlistStore'

const mocks = vi.hoisted(() => ({
  getLinkedEmail: vi.fn<() => Promise<string | null>>(async () => null),
  refreshTokens: vi.fn(async () => null as null | { access_token: string; refresh_token: string }),
  revokeAccessToken: vi.fn(async () => true)
}))

vi.mock('../../features/billing/billing', () => ({ getLinkedEmail: mocks.getLinkedEmail }))
vi.mock('../../features/billing/trakt', () => ({
  refreshTokens: mocks.refreshTokens,
  revokeAccessToken: mocks.revokeAccessToken
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/trakt/disconnect'

const post = () => makeReq({ method: 'POST', body: { email: 'u@e.com', key: 'k' }, ua: 'Mozilla/5.0' })

beforeEach(() => {
  resetFakeRedis()
  vi.clearAllMocks()
  mocks.getLinkedEmail.mockResolvedValue('user@example.com')
  mocks.refreshTokens.mockResolvedValue({ access_token: 'at', refresh_token: 'rt-new' })
  mocks.revokeAccessToken.mockResolvedValue(true)
})

describe('POST /api/trakt/disconnect', () => {
  it('rejects non-POST requests', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('403s on invalid sync credentials', async () => {
    mocks.getLinkedEmail.mockResolvedValue(null)
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(403)
  })

  it('drops the link and revokes the grant on Trakt', async () => {
    fakeRedis.map.set(TRAKT_KEY, { 'user@example.com': { refreshToken: 'rt' } })
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.refreshTokens).toHaveBeenCalledWith('rt', expect.any(String))
    expect(mocks.revokeAccessToken).toHaveBeenCalledWith('at')
    expect(fakeRedis.map.has(TRAKT_KEY)).toBe(false)
  })

  it('drops the link without a revoke when refresh fails', async () => {
    fakeRedis.map.set(TRAKT_KEY, { 'user@example.com': { refreshToken: 'rt' } })
    mocks.refreshTokens.mockResolvedValue(null)
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.revokeAccessToken).not.toHaveBeenCalled()
    expect(fakeRedis.map.has(TRAKT_KEY)).toBe(false)
  })

  it('still drops the link when revoke rejects', async () => {
    fakeRedis.map.set(TRAKT_KEY, { 'user@example.com': { refreshToken: 'rt' } })
    mocks.revokeAccessToken.mockResolvedValue(false)
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(200)
    expect(fakeRedis.map.has(TRAKT_KEY)).toBe(false)
  })

  it('is a no-op 200 when nothing is linked', async () => {
    const res = makeRes()
    await handler(post(), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.refreshTokens).not.toHaveBeenCalled()
    expect(mocks.revokeAccessToken).not.toHaveBeenCalled()
  })
})
