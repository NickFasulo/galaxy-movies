import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTmdb, TmdbError } from './tmdb'

const fetchMock = vi.hoisted(() => vi.fn())
const edgeGet = vi.hoisted(() => vi.fn<(key: string) => Promise<Response | null>>(async () => null))
const edgePut = vi.hoisted(() => vi.fn<(key: string, body: ArrayBuffer, contentType: string, ttl: number) => Promise<void>>(async () => {}))
vi.stubGlobal('fetch', fetchMock)
vi.mock('../../lib/edgeCache', () => ({ edgeCacheGet: edgeGet, edgeCachePut: edgePut }))

beforeEach(() => {
  vi.stubEnv('TMDB_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  fetchMock.mockReset()
  edgeGet.mockReset()
  edgePut.mockReset()
})

describe('fetchTmdb', () => {
  it('throws TmdbError carrying the upstream status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    const err = await fetchTmdb('/movie/0').catch((e) => e)
    expect(err).toBeInstanceOf(TmdbError)
    expect((err as TmdbError).status).toBe(404)
    // 4xx isn't retried
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws a status-less TmdbError when the network keeps failing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const err = await fetchTmdb('/movie/1').catch((e) => e)
    expect(err).toBeInstanceOf(TmdbError)
    expect((err as TmdbError).status).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries once on a 429 then returns data', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, text: async () => '{"id":7}' })
    await expect(fetchTmdb<{ id: number }>('/movie/7')).resolves.toEqual({ id: 7 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends params through the query string and drops nullish values', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' })
    await fetchTmdb('/discover/movie', { page: 2, with_genres: '28', skip: undefined })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/3/discover/movie')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('with_genres')).toBe('28')
    expect(url.searchParams.has('skip')).toBe(false)
    expect(url.searchParams.get('api_key')).toBe('test-key')
  })
})

describe('fetchTmdb edge cache', () => {
  it('serves a repeat call from the edge cache without re-fetching', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '{"id":7}' })
    edgeGet
      .mockResolvedValueOnce(null)
      .mockResolvedValue(new Response('{"id":7}', { headers: { 'Content-Type': 'application/json' } }))

    await expect(fetchTmdb<{ id: number }>('/movie/7')).resolves.toEqual({ id: 7 })
    await expect(fetchTmdb<{ id: number }>('/movie/7')).resolves.toEqual({ id: 7 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(edgePut).toHaveBeenCalledTimes(1)
    // The api_key must never enter the cache key.
    expect(String(edgePut.mock.calls[0][0])).not.toContain('test-key')
  })

  it('keys the cache on the param set, not the param order', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' })
    edgeGet
      .mockResolvedValueOnce(null)
      .mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    await fetchTmdb('/discover/movie', { page: 2, with_genres: '28' })
    await fetchTmdb('/discover/movie', { with_genres: '28', page: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache entirely when cacheSeconds is 0', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '{}' })
    await fetchTmdb('/movie/7', {}, { cacheSeconds: 0 })
    await fetchTmdb('/movie/7', {}, { cacheSeconds: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(edgeGet).not.toHaveBeenCalled()
    expect(edgePut).not.toHaveBeenCalled()
  })

  it('never caches an upstream error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    await fetchTmdb('/movie/0').catch(() => {})
    expect(edgePut).not.toHaveBeenCalled()
  })
})
