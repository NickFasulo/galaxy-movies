import { describe, expect, it, vi, beforeEach } from 'vitest'
import { makeReq, makeRes, fakeRedis, resetFakeRedis } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string, params?: Record<string, unknown>) => Promise<{ results: unknown[]; total_pages: number }>>(async () => ({ results: [], total_pages: 0 })),
  fetchDiscoverMovies: vi.fn<(opts?: Record<string, unknown>) => Promise<{ results: unknown[]; total_pages: number }>>(async () => ({ results: [], total_pages: 0 })),
  fetchDiscoverTv: vi.fn<(opts?: Record<string, unknown>) => Promise<{ results: unknown[]; total_pages: number }>>(async () => ({ results: [], total_pages: 0 }))
}))

vi.mock('../../features/catalog/tmdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../features/catalog/tmdb')>()
  return {
    ...actual,
    fetchTmdb: mocks.fetchTmdb,
    fetchDiscoverMovies: mocks.fetchDiscoverMovies,
    fetchDiscoverTv: mocks.fetchDiscoverTv
  }
})
vi.mock('../../lib/redis', () => ({ getRedis: () => fakeRedis.kv }))

import handler from '../../pages/api/discover'

beforeEach(() => {
  resetFakeRedis()
  mocks.fetchDiscoverMovies.mockResolvedValue({ results: [{ id: 1 }], total_pages: 3 })
  mocks.fetchDiscoverTv.mockResolvedValue({ results: [{ id: 2 }], total_pages: 2 })
  mocks.fetchTmdb.mockResolvedValue({ results: [{ id: 9, poster_path: '/p.jpg' }], total_pages: 5 })
})

describe('GET /api/discover', () => {
  it('rejects non-GET and bot requests', async () => {
    const post = makeRes()
    await handler(makeReq({ method: 'POST', query: { genre: 'action' } }), post)
    expect(post.statusCode).toBe(405)

    const bot = makeRes()
    await handler(makeReq({ query: { genre: 'action' }, ua: 'curl/8.0' }), bot)
    expect(bot.statusCode).toBe(403)
  })

  it('400s on malformed company and network ids without calling TMDB', async () => {
    const badQueries: Record<string, string>[] = [
      { company: 'abc' }, { company: '-1' }, { network: 'x' }, { company: '12345678901' }
    ]
    for (const query of badQueries) {
      const res = makeRes()
      await handler(makeReq({ query }), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
  })

  it('400s on an unknown category, genre, or provider', async () => {
    const badQueries: Record<string, string>[] = [
      { category: 'not-a-category' },
      { genre: 'not-a-genre' },
      { provider: 'not-a-provider' }
    ]
    for (const query of badQueries) {
      const res = makeRes()
      await handler(makeReq({ query }), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.fetchDiscoverMovies).not.toHaveBeenCalled()
  })

  it('400s when no filter is supplied', async () => {
    const res = makeRes()
    await handler(makeReq({ query: {} }), res)
    expect(res.statusCode).toBe(400)
    expect(res.jsonBody).toEqual({ message: 'Missing filter' })
  })

  it('fetches company movies by popularity through fetchTmdb', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { company: '41077', page: '2' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ results: [{ id: 9, poster_path: '/p.jpg' }], total_pages: 5, page: 2 })
    expect(mocks.fetchTmdb).toHaveBeenCalledWith('/discover/movie', {
      page: 2,
      include_adult: 'false',
      sort_by: 'popularity.desc',
      with_companies: '41077'
    })
  })

  it('fetches network tv by vote count and normalizes titles', async () => {
    mocks.fetchTmdb.mockResolvedValue({ results: [{ id: 9, name: 'Show', poster_path: '/p.jpg' }], total_pages: 1 })
    const res = makeRes()
    await handler(makeReq({ query: { network: '213' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.fetchTmdb).toHaveBeenCalledWith('/discover/tv', {
      page: 1,
      include_adult: 'false',
      sort_by: 'vote_count.desc',
      'vote_count.gte': 100,
      with_networks: '213'
    })
  })

  it('drops posterless company results', async () => {
    mocks.fetchTmdb.mockResolvedValue({
      results: [{ id: 9, poster_path: '/p.jpg' }, { id: 10, poster_path: null }],
      total_pages: 1
    })
    const res = makeRes()
    await handler(makeReq({ query: { company: '41077' } }), res)
    expect((res.jsonBody as { results: { id: number }[] }).results).toHaveLength(1)
  })

  it('routes category+provider queries to the discover helpers', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { category: 'popular', provider: 'netflix', type: 'tv', page: '2' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.fetchDiscoverTv).toHaveBeenCalledWith(expect.objectContaining({
      category: 'popular',
      providerId: '8',
      region: 'US',
      page: 2
    }))
    expect(res.jsonBody).toEqual({ results: [{ id: 2 }], total_pages: 2, page: 2 })
  })

  it('passes the resolved genre id and params to the helpers', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { genre: 'action' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.fetchDiscoverMovies).toHaveBeenCalledWith(expect.objectContaining({
      genreId: 28,
      providerId: null,
      page: 1
    }))
  })

  it('company wins over a simultaneous category filter', async () => {
    const res = makeRes()
    await handler(makeReq({ query: { company: '41077', category: 'popular' } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.fetchTmdb).toHaveBeenCalled()
    expect(mocks.fetchDiscoverMovies).not.toHaveBeenCalled()
  })

  it('502s when the upstream call throws', async () => {
    mocks.fetchTmdb.mockRejectedValue(new Error('tmdb down'))
    const res = makeRes()
    await handler(makeReq({ query: { company: '41077' } }), res)
    expect(res.statusCode).toBe(502)
  })

  it('per-IP rate limit trips at 60 requests and blocks the upstream call', async () => {
    fakeRedis.map.set('discover_rl:10.0.0.9', 60)
    const res = makeRes()
    await handler(makeReq({ query: { genre: 'action' }, ip: '10.0.0.9' }), res)
    expect(res.statusCode).toBe(429)
    expect(mocks.fetchDiscoverMovies).not.toHaveBeenCalled()
  })

  it('429s when the global budget trips, before any upstream work', async () => {
    fakeRedis.map.set('global_rl:discover:all', 2000)
    const res = makeRes()
    await handler(makeReq({ query: { genre: 'action' } }), res)
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('3600')
    expect(mocks.fetchDiscoverMovies).not.toHaveBeenCalled()
  })
})
