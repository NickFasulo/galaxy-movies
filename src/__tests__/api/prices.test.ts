import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'
import type { PricePayload } from '../../features/catalog/prices'

const mocks = vi.hoisted(() => ({
  getPriceOffers: vi.fn<(opts?: Record<string, unknown>) => Promise<object>>(async () => ({}))
}))

vi.mock('../../features/catalog/prices', () => ({ getPriceOffers: mocks.getPriceOffers }))
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/prices'

const offerPayload = (overrides: Partial<PricePayload> = {}): PricePayload => ({
  region: 'US',
  fetchedAt: 1700000000000,
  offers: [{ provider: 'Netflix', store: 'Netflix', type: 'subscription', format: null, price: null, currency: 'USD', url: null, seasons: null }],
  cheapest: { rent: null, buy: null },
  extras: { criticScore: null, userRating: null, relevancePercentile: null, gruv: null },
  ...overrides
})

beforeEach(() => {
  resetFakeRedis()
  mocks.getPriceOffers.mockResolvedValue(offerPayload())
})

describe('GET /api/prices', () => {
  it('rejects non-GET and bot requests', async () => {
    const post = makeRes()
    await handler(makeReq({ method: 'POST', query: { id: '1' } }), post)
    expect(post.statusCode).toBe(405)

    const bot = makeRes()
    await handler(makeReq({ query: { id: '1' }, ua: 'curl/8.0' }), bot)
    expect(bot.statusCode).toBe(403)
  })

  it('400s on missing or non-numeric ids', async () => {
    for (const query of [{}, { id: 'x' }, { id: '-3' }, { id: '1.5' }] as Record<string, string>[]) {
      const res = makeRes()
      await handler(makeReq({ query }), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.getPriceOffers).not.toHaveBeenCalled()
  })

  it('fetches uncached prices and writes them to Redis with the 72h TTL', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { id: '11' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ cacheKey: 'price:movie:US:11', offers: [{ provider: 'Netflix' }] })
    expect(mocks.getPriceOffers).toHaveBeenCalledWith({
      tmdbId: '11', mediaType: 'movie', region: 'US', title: undefined, year: undefined
    })
    expect(fakeRedis.kv.set).toHaveBeenCalledWith('price:movie:US:11',
      expect.objectContaining({ cacheKey: 'price:movie:US:11' }), { ex: 259200 })
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800')
  })

  it('serves the Redis shared cache without billing a limiter command', async () => {
    const cached = { cacheKey: 'price:movie:US:22', ...offerPayload() }
    fakeRedis.map.set('price:movie:US:22', cached)
    const res = makeRes()
    await handler(makeReq({ query: { id: '22' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual(cached)
    expect(mocks.getPriceOffers).not.toHaveBeenCalled()
    expect(fakeRedis.kv.eval).not.toHaveBeenCalled()
  })

  it('serves the local LRU without touching Redis or upstream at all', async () => {
    // First call populates the local cache; the second is a pure LRU hit.
    await handler(makeReq({ query: { id: '33' } }), makeRes())
    vi.clearAllMocks()
    const res = makeRes()
    await handler(makeReq({ query: { id: '33' } }), res)
    expect(res.statusCode).toBe(200)
    expect(fakeRedis.kv.get).not.toHaveBeenCalled()
    expect(fakeRedis.kv.eval).not.toHaveBeenCalled()
    expect(mocks.getPriceOffers).not.toHaveBeenCalled()
  })

  it('stores empty offers under the short 6h TTL', async () => {
    mocks.getPriceOffers.mockResolvedValue(offerPayload({ offers: [] }))
    const res = makeRes()
    await handler(makeReq({ query: { id: '44' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ offers: [] })
    expect(fakeRedis.kv.set).toHaveBeenCalledWith('price:movie:US:44',
      expect.objectContaining({ offers: [] }), { ex: 21600 })
  })

  it('returns the stable empty payload when the upstream call throws', async () => {
    mocks.getPriceOffers.mockRejectedValue(new Error('watchmode down'))
    const res = makeRes()
    await handler(makeReq({ query: { id: '55' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ offers: [], region: 'US' })
    expect(fakeRedis.kv.set).toHaveBeenCalledWith('price:movie:US:55',
      expect.objectContaining({ offers: [] }), { ex: 21600 })
  })

  it('namespaces the cache key for tv lookups', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { id: '66', type: 'tv' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.getPriceOffers).toHaveBeenCalledWith(expect.objectContaining({
      tmdbId: '66', mediaType: 'tv'
    }))
    expect(fakeRedis.kv.set).toHaveBeenCalledWith('price:tv:US:66', expect.anything(), { ex: 259200 })
  })

  it('per-IP rate limit trips at 60 and blocks the upstream call', async () => {
    fakeRedis.map.set('price_rl:10.0.0.7', 60)
    const res = makeRes()
    await handler(makeReq({ query: { id: '77' }, ip: '10.0.0.7' }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.getPriceOffers).not.toHaveBeenCalled()
  })

  it('429s when the global budget trips on an uncached id', async () => {
    fakeRedis.map.set('global_rl:price:all', 100)
    const res = makeRes()
    await handler(makeReq({ query: { id: '88' } }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.getPriceOffers).not.toHaveBeenCalled()
  })

  it('429s on the tripped memo even for a shared-cache hit', async () => {
    // The previous test trips 'price' for ~60s in this isolate — the
    // isGlobalBudgetTripped short-circuit now denies before the Redis read.
    fakeRedis.map.set('price:movie:US:99', { cacheKey: 'price:movie:US:99', ...offerPayload() })
    const res = makeRes()
    await handler(makeReq({ query: { id: '99' } }), res)
    expect(res.statusCode).toBe(429)
    expect(fakeRedis.kv.get).not.toHaveBeenCalled()
  })
})
