import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  fetchRecommendedMovies: vi.fn<(id?: number) => Promise<{ results: unknown[] }>>(async () => ({ results: [] })),
  fetchRecommendedTv: vi.fn<(id?: number) => Promise<{ results: unknown[] }>>(async () => ({ results: [] }))
}))

vi.mock('../../features/catalog/tmdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/catalog/tmdb')>()
  return {
    ...actual,
    fetchRecommendedMovies: mocks.fetchRecommendedMovies,
    fetchRecommendedTv: mocks.fetchRecommendedTv
  }
})
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/recommendations'

beforeEach(() => {
  resetFakeRedis()
  mocks.fetchRecommendedMovies.mockResolvedValue({
    results: Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }))
  })
})

describe('GET /api/recommendations', () => {
  it('rejects non-GET and bot requests', async () => {
    const post = makeRes()
    await handler(makeReq({ method: 'POST', query: { id: '1' } }), post)
    expect(post.statusCode).toBe(405)

    const bot = makeRes()
    await handler(makeReq({ query: { id: '1' }, ua: 'curl/8.0' }), bot)
    expect(bot.statusCode).toBe(403)
  })

  it('400s on a missing or non-numeric id', async () => {
    for (const query of [{}, { id: 'abc' }, { id: '0' }, { id: '-4' }] as Record<string, string>[]) {
      const res = makeRes()
      await handler(makeReq({ query }), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.fetchRecommendedMovies).not.toHaveBeenCalled()
  })

  it('returns at most 12 recommendations with CDN cache headers', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { id: '100' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ results: expect.any(Array) })
    expect((res.jsonBody as { results: unknown[] }).results).toHaveLength(12)
    expect(res.headers['Cache-Control']).toBe('public, s-maxage=21600, stale-while-revalidate=86400')
    expect(mocks.fetchRecommendedMovies).toHaveBeenCalledWith(100)
  })

  it('uses the tv endpoint for mediaType=tv', async () => {
    mocks.fetchRecommendedTv.mockResolvedValue({ results: [{ id: 50 }] })
    const res = makeRes()
    await handler(makeReq({ query: { id: '7', mediaType: 'tv' } }), res)
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { results: unknown[] }).results).toEqual([{ id: 50 }])
    expect(mocks.fetchRecommendedTv).toHaveBeenCalledWith(7)
    expect(mocks.fetchRecommendedMovies).not.toHaveBeenCalled()
  })

  it('502s when TMDB fails', async () => {
    mocks.fetchRecommendedMovies.mockRejectedValue(new Error('boom'))
    const res = makeRes()
    await handler(makeReq({ query: { id: '100' } }), res)
    expect(res.statusCode).toBe(502)
  })

  it('per-IP rate limit trips at 60 and blocks the upstream call', async () => {
    fakeRedis.map.set('recs_rl:10.0.0.5', 60)
    const res = makeRes()
    await handler(makeReq({ query: { id: '100' }, ip: '10.0.0.5' }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.fetchRecommendedMovies).not.toHaveBeenCalled()
  })

  it('429s when the global budget trips, before touching TMDB', async () => {
    fakeRedis.map.set('global_rl:recs:all', 2000)
    const res = makeRes()
    await handler(makeReq({ query: { id: '100' } }), res)
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('3600')
    expect(mocks.fetchRecommendedMovies).not.toHaveBeenCalled()
  })
})
