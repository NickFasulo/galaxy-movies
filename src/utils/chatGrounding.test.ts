import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  wantsAvailability,
  wantsServiceChanges,
  wantsServiceRecommendation,
  fetchAvailabilityContext,
  fetchServiceChangesContext,
  fetchServicePicksContext
} from './chatGrounding'

const mocks = vi.hoisted(() => ({
  search: vi.fn(async () => [] as unknown[]),
  resolve: vi.fn(async () => [] as unknown[]),
  mentions: vi.fn(() => [] as unknown[]),
  fetchTmdb: vi.fn(async () => ({})),
  discoverMovies: vi.fn<(opts?: { providerId?: string | number | null; genreId?: number | string | null; region?: string; releasedAfter?: string }) => Promise<{ results: unknown[]; total_pages: number; total_results: number }>>(async () => ({ results: [], total_pages: 0, total_results: 0 })),
  discoverTv: vi.fn<(opts?: { providerId?: string | number | null; genreId?: number | string | null; region?: string; releasedAfter?: string }) => Promise<{ results: unknown[]; total_pages: number; total_results: number }>>(async () => ({ results: [], total_pages: 0, total_results: 0 })),
  changes: vi.fn(async () => ({} as Record<string, unknown>))
}))

vi.mock('./movieSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./movieSearch')>()),
  extractTitleMentions: mocks.mentions,
  resolveMovieMentions: mocks.resolve,
  searchMultiByQuery: mocks.search
}))
vi.mock('./tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tmdb')>()),
  fetchTmdb: mocks.fetchTmdb,
  fetchDiscoverMovies: mocks.discoverMovies,
  fetchDiscoverTv: mocks.discoverTv
}))
vi.mock('./streamingChanges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./streamingChanges')>()),
  getProviderChanges: mocks.changes
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mentions.mockReturnValue([])
  mocks.resolve.mockResolvedValue([])
  mocks.search.mockResolvedValue([])
  mocks.fetchTmdb.mockResolvedValue({})
  mocks.discoverMovies.mockResolvedValue({ results: [], total_pages: 0, total_results: 0 })
  mocks.discoverTv.mockResolvedValue({ results: [], total_pages: 0, total_results: 0 })
  mocks.changes.mockResolvedValue({})
})

describe('wantsAvailability', () => {
  it.each([
    'where can i watch Heat',
    'how do I stream Dune',
    'can i watch severance anywhere',
    'is Dune on Netflix',
    'is it still streaming on hulu?'
  ])('detects %s', (text) => {
    expect(wantsAvailability(text)).toBe(true)
  })

  it.each([
    'recommend a comedy',
    'what are the best movies this year',
    'what should i watch tonight' // no where/how/can-i/provider-word
  ])('ignores %s', (text) => {
    expect(wantsAvailability(text)).toBe(false)
  })
})

describe('wantsServiceChanges', () => {
  it.each([
    "what's new on netflix",
    'anything just added to hulu?',
    'what is leaving max this month',
    'new this week on my services',
    'did anything drop on prime'
  ])('detects %s', (text) => {
    expect(wantsServiceChanges(text)).toBe(true)
  })

  it.each([
    'where can i watch heat',
    'recommend something new to me' // "new" alone isn't a service-change intent
  ])('ignores %s', (text) => {
    expect(wantsServiceChanges(text)).toBe(false)
  })
})

describe('fetchAvailabilityContext', () => {
  const providers = { results: { US: { flatrate: [{ provider_name: 'Netflix' }], rent: [], buy: [{ provider_name: 'Apple TV' }] } } }
  const searchHit = (id: number) => ({ id, media_type: 'movie', title: 'Dune', poster_path: '/p.jpg' })

  it('resolves a quoted mention then injects regional provider names', async () => {
    mocks.mentions.mockReturnValue([{ match: '"Dune"', title: 'Dune', year: '2021', quoted: true }])
    mocks.resolve.mockResolvedValue([{ match: '"Dune"', movieId: 438631, mediaType: 'movie', title: 'Dune' }])
    mocks.fetchTmdb.mockResolvedValue(providers)
    const ctx = await fetchAvailabilityContext('where can i watch "Dune (2021)"', 'US')
    expect(ctx).toEqual({ title: 'Dune', mediaType: 'movie', region: 'US', flatrate: ['Netflix'], rent: [], buy: ['Apple TV'] })
    expect(mocks.fetchTmdb).toHaveBeenCalledWith('/movie/438631/watch/providers')
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it('falls back to a stripped question remainder for loose phrasing', async () => {
    mocks.search.mockResolvedValue([searchHit(438631)])
    mocks.fetchTmdb.mockResolvedValue(providers)
    const ctx = await fetchAvailabilityContext('is Dune still on Netflix?', 'US')
    expect(mocks.search).toHaveBeenCalledWith('Dune', 1)
    expect(ctx!.flatrate).toEqual(['Netflix'])
  })

  it('never searches a remainder made of filler words alone', async () => {
    const ctx = await fetchAvailabilityContext("what's on netflix", 'US')
    expect(mocks.search).not.toHaveBeenCalled()
    expect(ctx).toBeNull()
    expect(mocks.fetchTmdb).not.toHaveBeenCalled()
  })

  it('returns null when the title region has no offers, and caches it', async () => {
    mocks.search.mockResolvedValue([searchHit(55)])
    mocks.fetchTmdb.mockResolvedValue({ results: { US: {} } })
    expect(await fetchAvailabilityContext('where can i watch Obscure Film 1955', 'ZZ')).toBeNull()
    // A second lookup of the same id+region must not refetch.
    mocks.search.mockResolvedValue([searchHit(55)])
    await fetchAvailabilityContext('where can i watch Obscure Film 1955', 'ZZ')
    expect(mocks.fetchTmdb).toHaveBeenCalledTimes(1)
  })

  it('returns null on an upstream error without throwing', async () => {
    mocks.search.mockResolvedValue([searchHit(77)])
    mocks.fetchTmdb.mockRejectedValue(new Error('tmdb down'))
    await expect(fetchAvailabilityContext('where can i watch that movie about the thing', 'US')).resolves.toBeNull()
  })
})

describe('fetchServiceChangesContext', () => {
  const diff = (source: string, n: number) => ({
    source,
    updatedAt: 0,
    added: Array.from({ length: n }, (_, i) => ({ tmdbId: i, tmdbType: 'movie' as const, title: `${source} add ${i}`, year: 2024 })),
    left: Array.from({ length: n }, (_, i) => ({ tmdbId: i, tmdbType: 'movie' as const, title: `${source} left ${i}`, year: 2024 })),
    coming: [{ tmdbId: 1, tmdbType: 'tv' as const, title: `${source} show`, date: '2026-02-01', season: 3 }]
  })

  it('returns top-5 lists per chosen provider with date and season on coming', async () => {
    mocks.changes.mockResolvedValue({ netflix: diff('Netflix', 7) })
    const ctx = await fetchServiceChangesContext(['netflix'], 'US')
    expect(ctx).toHaveLength(1)
    expect(ctx![0]).toMatchObject({ provider: 'Netflix' })
    expect(ctx![0].added).toHaveLength(5)
    expect(ctx![0].leaving).toHaveLength(5)
    expect(ctx![0].coming).toEqual(['Netflix show (2026-02-01) season 3'])
    expect(mocks.changes).toHaveBeenCalledWith(['netflix'], { region: 'US' })
  })

  it('skips providers the user did not choose and nulls when nothing changed', async () => {
    mocks.changes.mockResolvedValue({ hulu: diff('Hulu', 2) })
    expect(await fetchServiceChangesContext(['netflix'], 'US')).toBeNull()
  })

  it('caps the service list at 8 keys', async () => {
    mocks.changes.mockResolvedValue({})
    const keys = Array.from({ length: 12 }, (_, i) => `svc${i}`)
    await fetchServiceChangesContext(keys, 'US')
    expect(mocks.changes).toHaveBeenCalledWith(keys.slice(0, 8), { region: 'US' })
  })
})

describe('wantsServiceRecommendation', () => {
  it.each([
    'recommend me some good action movies on hulu',
    'what should i watch on netflix',
    "what's on max tonight",
    'any good horror shows on prime',
    'something to binge on my services',
    'top comedies on peacock',
    'suggest some recent mystery movies on peacock',
    'recommend new movies on hulu'
  ])('detects %s', (text) => {
    expect(wantsServiceRecommendation(text)).toBe(true)
  })

  it.each([
    'is Heat on netflix',           // availability — specific title
    'where can i watch Dune',       // no service scope
    "what's new on netflix",        // catalog-change intent, not recommendation
    'recommend a good movie',       // no provider or my-services scope
    'did anything drop on hulu'     // change intent
  ])('ignores %s', (text) => {
    expect(wantsServiceRecommendation(text)).toBe(false)
  })
})

describe('fetchServicePicksContext', () => {
  const paged = (results: unknown[]) => ({ results, total_pages: 1, total_results: results.length })
  const movie = (id: number, title: string) => ({ id, title, release_date: '2024-01-01', poster_path: '/p.jpg' })
  const show = (id: number, name: string) => ({ id, name, title: name, first_air_date: '2023-01-01', release_date: '2023-01-01', poster_path: '/s.jpg' })

  it('maps the named provider and detected genre into a discover query', async () => {
    mocks.discoverMovies.mockResolvedValue(paged([movie(1, 'Heat'), movie(2, 'Speed')]) as never)
    const ctx = await fetchServicePicksContext('recommend good action movies on hulu', [], 'US')
    expect(mocks.discoverMovies).toHaveBeenCalledWith({ providerId: '15', genreId: 28, region: 'US' })
    expect(ctx).toEqual([{ provider: 'Hulu', mediaType: 'movie', genre: 'Action', titles: [
      { id: 1, title: 'Heat', year: '2024' },
      { id: 2, title: 'Speed', year: '2024' }
    ] }])
  })

  it('uses tv discover + tv genre ids for show requests', async () => {
    mocks.discoverTv.mockResolvedValue(paged([show(5, 'The Bear')]) as never)
    const ctx = await fetchServicePicksContext('any good action shows on netflix', [], 'GB')
    expect(mocks.discoverTv).toHaveBeenCalledWith({ providerId: '8', genreId: 10759, region: 'GB' })
    expect(ctx![0]).toMatchObject({ provider: 'Netflix', mediaType: 'tv' })
  })

  it('falls back to stored service keys for "my services" phrasing', async () => {
    mocks.discoverMovies.mockResolvedValue(paged([movie(9, 'Argo')]) as never)
    const ctx = await fetchServicePicksContext('what should i watch on my services', ['netflix', 'hulu'], 'IN')
    expect(mocks.discoverMovies).toHaveBeenCalledTimes(2)
    const providers = mocks.discoverMovies.mock.calls.map((c) => c[0]?.providerId)
    expect(providers).toEqual(['8', '15'])
    expect(ctx).toHaveLength(2)
  })

  it('returns null for unmapped or absent providers without calling TMDB', async () => {
    expect(await fetchServicePicksContext('recommend movies on mubi', [], 'US')).toBeNull()
    expect(await fetchServicePicksContext('recommend a good movie', ['netflix'], 'US')).toBeNull()
    expect(mocks.discoverMovies).not.toHaveBeenCalled()
    expect(mocks.discoverTv).not.toHaveBeenCalled()
  })

  it('caps provider fan-out at 3 and caches the result', async () => {
    mocks.discoverMovies.mockResolvedValue(paged([movie(1, 'Heat')]) as never)
    const msg = 'good movies on netflix hulu max peacock'
    await fetchServicePicksContext(msg, [], 'FR')
    expect(mocks.discoverMovies).toHaveBeenCalledTimes(3)
    await fetchServicePicksContext(msg, [], 'FR')
    expect(mocks.discoverMovies).toHaveBeenCalledTimes(3)
  })

  it('date-filters and marks picks when the question asks for recent titles', async () => {
    mocks.discoverMovies.mockResolvedValue(paged([movie(3, 'Longlegs')]) as never)
    const ctx = await fetchServicePicksContext('suggest some recent mystery movies on peacock', [], 'CA')
    const opts = mocks.discoverMovies.mock.calls.at(-1)![0]
    expect(opts).toMatchObject({ providerId: '386', genreId: 9648, region: 'CA' })
    const cutoff = opts?.releasedAfter as string
    expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const daysBack = (Date.now() - new Date(cutoff).getTime()) / 86400000
    expect(daysBack).toBeGreaterThan(360)
    expect(daysBack).toBeLessThan(370)
    expect(ctx![0].releasedAfter).toBe(cutoff)
  })

  it.each(['mystery movies on peacock', 'good dramas on hulu'])(
    'leaves releasedAfter unset without recency phrasing: %s',
    async (msg) => {
      mocks.discoverMovies.mockResolvedValue(paged([movie(4, 'Gone Girl')]) as never)
      await fetchServicePicksContext(msg, [], msg.includes('peacock') ? 'AU' : 'DE')
      expect(mocks.discoverMovies.mock.calls.at(-1)![0]?.releasedAfter).toBeUndefined()
    }
  )
})

describe('questionRemainder hardening', () => {
  it('strips recommendation phrasing so availability never resolves a bogus title', async () => {
    const ctx = await fetchAvailabilityContext('can you recommend me some good action movies on hulu', 'NL')
    expect(mocks.search).not.toHaveBeenCalled()
    expect(ctx).toBeNull()
  })
})
