import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  wantsAvailability,
  wantsServiceChanges,
  fetchAvailabilityContext,
  fetchServiceChangesContext
} from './chatGrounding'

const mocks = vi.hoisted(() => ({
  search: vi.fn(async () => [] as unknown[]),
  resolve: vi.fn(async () => [] as unknown[]),
  mentions: vi.fn(() => [] as unknown[]),
  fetchTmdb: vi.fn(async () => ({})),
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
  fetchTmdb: mocks.fetchTmdb
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
