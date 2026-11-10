import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveWhere, lookupWhere, whereCacheKey, whereResultCache } from './whereLookup'

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string, params?: Record<string, unknown>) => Promise<unknown>>(async () => ({})),
  getTitleChanges: vi.fn(async () => null as Record<string, { p: string; date?: string }[] | undefined> | null),
  getProviderIds: vi.fn((key: string) => (key === 'netflix' ? [8] : key === 'hulu' ? [15] : []))
}))

vi.mock('./tmdb', () => ({
  fetchTmdb: mocks.fetchTmdb,
  getProviderIds: mocks.getProviderIds,
  streamingProviders: {
    netflix: { title: 'Netflix Movies', ids: { default: 8 } },
    hulu: { title: 'Hulu Movies', ids: { default: 15 } }
  }
}))
vi.mock('./streamingChanges', () => ({ getTitleChanges: mocks.getTitleChanges }))
vi.mock('./embed', () => ({ providerLabel: (k: string) => (k === 'netflix' ? 'Netflix' : k === 'hulu' ? 'Hulu' : k) }))

const FIGHT_CLUB = { id: 550, title: 'Fight Club', release_date: '1999-10-15', media_type: 'movie' }
const US_PROVIDERS = {
  results: {
    US: {
      link: 'https://www.themoviedb.org/movie/550-fight-club/watch',
      flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' }],
      free: [{ provider_id: 73, provider_name: 'Tubi TV', logo_path: '/t.jpg' }]
    }
  }
}

describe('resolveWhere', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    whereResultCache.clear()
  })

  it('resolves a TMDB id + type and maps provider categories', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/550') return FIGHT_CLUB
      if (path === '/movie/550/watch/providers') return US_PROVIDERS
      return {}
    })
    const result = await resolveWhere({ id: 550, type: 'movie', region: 'US' })
    expect(result).toMatchObject({
      tmdbId: 550,
      tmdbType: 'movie',
      title: 'Fight Club',
      year: 1999,
      region: 'US'
    })
    expect(result?.providers.flatrate).toEqual([{ id: 8, name: 'Netflix' }])
    expect(result?.providers.free).toEqual([{ id: 73, name: 'Tubi TV' }])
    expect(result?.providers.rent).toEqual([])
    expect(result?.url).toContain('/movies/550')
  })

  it('resolves an IMDb id through /find', async () => {
    mocks.fetchTmdb.mockImplementation(async (path, params) => {
      if (path === '/find/tt0137523') {
        expect(params).toMatchObject({ external_source: 'imdb_id' })
        return { movie_results: [FIGHT_CLUB], tv_results: [] }
      }
      if (path === '/movie/550/watch/providers') return US_PROVIDERS
      return {}
    })
    const result = await resolveWhere({ imdbId: 'tt0137523', region: 'US' })
    expect(result?.tmdbId).toBe(550)
    expect(result?.tmdbType).toBe('movie')
  })

  it('falls back to tv_results when no movie matches the IMDb id', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/find/tt0944947') {
        return { movie_results: [], tv_results: [{ id: 1399, name: 'Game of Thrones', first_air_date: '2011-04-17' }] }
      }
      if (path === '/tv/1399/watch/providers') return US_PROVIDERS
      return {}
    })
    const result = await resolveWhere({ imdbId: 'tt0944947', region: 'US' })
    expect(result?.tmdbType).toBe('tv')
    expect(result?.url).toContain('/tv/1399')
  })

  it('prefers the year-matching search result among same-title hits', async () => {
    mocks.fetchTmdb.mockImplementation(async (path, params) => {
      if (path === '/search/multi') {
        expect(params).toMatchObject({ query: 'dune' })
        return {
          results: [
            { id: 438631, title: 'Dune', release_date: '2021-10-22', media_type: 'movie', poster_path: '/a.jpg' },
            { id: 841, title: 'Dune', release_date: '1984-12-14', media_type: 'movie', poster_path: '/b.jpg' },
            { id: 999, name: 'Some Person', media_type: 'person' }
          ]
        }
      }
      if (path === '/movie/841/watch/providers') return US_PROVIDERS
      return {}
    })
    const result = await resolveWhere({ title: 'dune', year: '1984', region: 'US' })
    expect(result?.tmdbId).toBe(841)
  })

  it('uses typed search when type is given', async () => {
    mocks.fetchTmdb.mockImplementation(async (path, params) => {
      if (path === '/search/tv') {
        expect(params).toMatchObject({ query: 'severance' })
        return { results: [{ id: 95396, name: 'Severance', first_air_date: '2022-02-18' }] }
      }
      if (path === '/tv/95396/watch/providers') return US_PROVIDERS
      return {}
    })
    const result = await resolveWhere({ title: 'severance', type: 'tv', region: 'US' })
    expect(result?.tmdbType).toBe('tv')
    expect(result?.tmdbId).toBe(95396)
  })

  it('returns null when the title resolves to nothing', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/search/multi') return { results: [] }
      return {}
    })
    expect(await resolveWhere({ title: 'definitely-not-a-real-thing-xyz', region: 'US' })).toBeNull()
  })

  it('returns null when the region has no provider entry', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/550') return FIGHT_CLUB
      if (path === '/movie/550/watch/providers') return { results: { IN: { flatrate: [] } } }
      return {}
    })
    expect(await resolveWhere({ id: 550, type: 'movie', region: 'US' })).toBeNull()
  })

  it('annotates providers with departure dates and emits raw events', async () => {
    mocks.getTitleChanges.mockResolvedValue({
      leaving: [{ p: 'netflix', date: '2026-11-28' }],
      coming: [{ p: 'hulu', date: '2026-12-05' }, { p: 'unknown-key', date: '2026-12-01' }]
    })
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/movie/550') return FIGHT_CLUB
      if (path === '/movie/550/watch/providers') return US_PROVIDERS
      return {}
    })
    const result = await resolveWhere({ id: 550, type: 'movie', region: 'US' })
    expect(result?.providers.flatrate[0]).toEqual({ id: 8, name: 'Netflix', leavingOn: '2026-11-28' })
    expect(result?.providers.free[0]).toEqual({ id: 73, name: 'Tubi TV' })
    expect(result?.events?.leaving).toEqual([{ key: 'netflix', provider: 'Netflix', date: '2026-11-28' }])
    // unknown provider keys are filtered from the events list
    expect(result?.events?.coming).toEqual([{ key: 'hulu', provider: 'Hulu', date: '2026-12-05' }])
  })
})

describe('lookupWhere caching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    whereResultCache.clear()
  })

  it('caches hits and misses per normalized key', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/search/multi') return { results: [FIGHT_CLUB] }
      if (path === '/movie/550/watch/providers') return US_PROVIDERS
      return {}
    })
    const q: Parameters<typeof lookupWhere>[0] = { title: 'Fight Club!!', region: 'US' }
    const first = await lookupWhere(q)
    const calls = mocks.fetchTmdb.mock.calls.length
    expect(first?.tmdbId).toBe(550)

    // Same normalized title → LRU hit, no upstream calls
    const second = await lookupWhere({ title: 'fight club', region: 'US' })
    expect(second?.tmdbId).toBe(550)
    expect(mocks.fetchTmdb.mock.calls.length).toBe(calls)
    expect(whereCacheKey({ title: 'fight club', region: 'US' })).toBe(whereCacheKey(q))
  })
})
