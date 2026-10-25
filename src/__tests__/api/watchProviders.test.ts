import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string) => Promise<{ results: Record<string, { flatrate?: { provider_id: number }[] }> }>>(async () => ({ results: {} }))
}))

vi.mock('../../features/catalog/tmdb', () => ({ fetchTmdb: mocks.fetchTmdb }))
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

let handler: typeof import('../../pages/api/watchProviders').default

beforeEach(async () => {
  resetFakeRedis()
  vi.resetModules()
  mocks.fetchTmdb.mockImplementation(async () => ({
    results: { US: { flatrate: [{ provider_id: 8 }, { provider_id: 9 }] } }
  }))
  handler = (await import('../../pages/api/watchProviders')).default
})

describe('GET /api/watchProviders', () => {
  it('requires an ids param', async () => {
    const res = makeRes()
    await handler(makeReq({ query: {} }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
  })

  it('resolves flatrate provider ids per requested title', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { ids: '1,2', region: 'US', type: 'movie' } }), res)
    expect(res.statusCode).toBe(200)
    const body = res.jsonBody as { region: string; results: Record<string, number[]> }
    expect(body.region).toBe('US')
    expect(body.results['1']).toEqual([8, 9])
    expect(body.results['2']).toEqual([8, 9])
    expect(mocks.fetchTmdb).toHaveBeenCalledWith('/movie/1/watch/providers')
    expect(mocks.fetchTmdb).toHaveBeenCalledWith('/movie/2/watch/providers')
  })

  it('returns [] for ids whose upstream lookup fails', async () => {
    mocks.fetchTmdb.mockRejectedValue(new Error('tmdb down'))
    const res = makeRes()
    await handler(makeReq({ query: { ids: '5' } }), res)
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { results: Record<string, number[]> }).results['5']).toEqual([])
  })

  it('keeps cached entries out of Redis entirely — zero billed commands on a cache hit', async () => {
    // First call populates the LRU; the identical second call must not run
    // a single rate-limit eval or upstream fetch.
    const query = { ids: '10', region: 'US' }
    await handler(makeReq({ query }), makeRes())
    expect(mocks.fetchTmdb).toHaveBeenCalledTimes(1)
    expect(fakeRedis.kv.eval).toHaveBeenCalled()

    vi.clearAllMocks()
    const res = makeRes()
    await handler(makeReq({ query }), res)
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { results: Record<string, number[]> }).results['10']).toEqual([8, 9])
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
    expect(fakeRedis.kv.eval).not.toHaveBeenCalled()
  })

  it('rate-limits only the uncached ids on a mixed request', async () => {
    // Warm one id, then a mixed batch charges lookup budget for the new one only.
    await handler(makeReq({ query: { ids: '20' } }), makeRes())
    vi.clearAllMocks()
    mocks.fetchTmdb.mockImplementation(async () => ({ results: { US: { flatrate: [{ provider_id: 8 }] } } }))

    const res = makeRes()
    await handler(makeReq({ query: { ids: '20,21' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.fetchTmdb).toHaveBeenCalledTimes(1)
    expect(mocks.fetchTmdb).toHaveBeenCalledWith('/movie/21/watch/providers')
    // wp_lookup_rl is the cost-based bucket — one eval per limiter.
    expect(fakeRedis.kv.eval).toHaveBeenCalledTimes(3)
  })

  it('429s when the global lookup budget is tripped and uncached work remains', async () => {
    fakeRedis.map.set('global_rl:wp_lookup:all', 5000)
    const res = makeRes()
    await handler(makeReq({ query: { ids: '99' } }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
  })

  it('still serves fully cached requests while the global budget is tripped', async () => {
    // Populate the cache BEFORE the budget trips — cached reads bypass it.
    const query = { ids: '42' }
    await handler(makeReq({ query }), makeRes())
    fakeRedis.map.set('global_rl:wp_lookup:all', 5000)
    const res = makeRes()
    await handler(makeReq({ query }), res)
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { results: Record<string, number[]> }).results['42']).toEqual([8, 9])
  })
})
