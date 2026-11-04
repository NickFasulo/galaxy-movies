import { describe, expect, it, vi, beforeEach } from 'vitest'
import handler from '../../pages/api/poster-paths'
import { makeReq, makeRes } from '../helpers/mockApi'

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string) => Promise<unknown>>(async () => ({})),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../features/catalog/tmdb', () => ({ fetchTmdb: mocks.fetchTmdb }))
vi.mock('../../lib/redis', () => ({
  getRedis: () => ({ eval: mocks.kvEval })
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/poster-paths', () => {
  it('resolves poster paths for movie and tv items', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/1') return { poster_path: '/film.jpg', title: 'Film', release_date: '2001-05-01' }
      if (path === '/tv/2') return { poster_path: '/show.jpg', name: 'Show', first_air_date: '2019-01-01' }
      throw new Error(`unexpected ${path}`)
    })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { items: [{ id: 1 }, { id: 2, mediaType: 'tv' }] } }), res)
    expect(res.statusCode).toBe(200)
    const { results } = res.jsonBody as { results: Record<string, unknown>[] }
    expect(results).toEqual([
      { id: 1, mediaType: 'movie', poster_path: '/film.jpg', title: 'Film', year: '2001' },
      { id: 2, mediaType: 'tv', poster_path: '/show.jpg', title: 'Show', year: '2019' }
    ])
  })

  it('drops items whose TMDB lookup fails instead of failing the batch', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/1') return { poster_path: '/film.jpg', title: 'Film', release_date: '2001-01-01' }
      throw new Error('tmdb down')
    })
    const res = makeRes()
    await handler(makeReq({ method: 'POST', body: { items: [{ id: 1 }, { id: 2 }] } }), res)
    expect(res.statusCode).toBe(200)
    const { results } = res.jsonBody as { results: Record<string, unknown>[] }
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe(1)
  })

  it('rejects a missing or empty items list without calling TMDB', async () => {
    for (const body of [undefined, {}, { items: 'x' }, { items: [] }, { items: [{ id: -1 }, { id: 'a' }] }]) {
      const res = makeRes()
      await handler(makeReq({ method: 'POST', body }), res)
      expect(res.statusCode).toBe(400)
    }
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })
})
