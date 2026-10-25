import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchTmdb, TmdbError } from './tmdb'

const fetchMock = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.stubEnv('TMDB_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  fetchMock.mockReset()
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 7 }) })
    await expect(fetchTmdb<{ id: number }>('/movie/7')).resolves.toEqual({ id: 7 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends params through the query string and drops nullish values', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    await fetchTmdb('/discover/movie', { page: 2, with_genres: '28', skip: undefined })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/3/discover/movie')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('with_genres')).toBe('28')
    expect(url.searchParams.has('skip')).toBe(false)
    expect(url.searchParams.get('api_key')).toBe('test-key')
  })
})
