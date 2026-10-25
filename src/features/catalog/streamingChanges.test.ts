import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import { PROVIDER_NAME_MATCH } from './tmdb'
import {
  buildTitleIndex,
  getMonthlyChanges,
  getProviderCatalog,
  getProviderChanges,
  getTitleChangeIndex,
  getTitleChanges,
  updateStreamingChanges,
  type MonthlyChanges
} from './streamingChanges'
import { createFakeRedis } from '../../__tests__/helpers/mockApi'

type DiscoverOpts = { providerId?: string; region?: string; page?: number }

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string, params?: Record<string, unknown>) => Promise<{ results: unknown[] }>>(async () => ({ results: [] })),
  fetchDiscoverMovies: vi.fn<(opts?: DiscoverOpts) => Promise<{ results: unknown[]; total_pages: number }>>(async () => ({ results: [], total_pages: 1 })),
  fetchDiscoverTv: vi.fn<(opts?: DiscoverOpts) => Promise<{ results: unknown[]; total_pages: number }>>(async () => ({ results: [], total_pages: 1 })),
  recordWatchmodeQuota: vi.fn(),
  watchmodeQuotaExceeded: vi.fn<() => Promise<boolean>>(async () => false),
  warmAiTitleCache: vi.fn<(candidates?: { id: number; title?: string }[]) => Promise<number>>(async () => 0),
  pingIndexNow: vi.fn<(urls?: string[]) => Promise<boolean>>(async () => true)
}))

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('./tmdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tmdb')>()
  return {
    ...actual,
    fetchTmdb: mocks.fetchTmdb,
    fetchDiscoverMovies: mocks.fetchDiscoverMovies,
    fetchDiscoverTv: mocks.fetchDiscoverTv
  }
})
vi.mock('./watchmodeQuota', () => ({
  recordWatchmodeQuota: mocks.recordWatchmodeQuota,
  watchmodeQuotaExceeded: mocks.watchmodeQuotaExceeded
}))
vi.mock('../ai/warmCache', () => ({ warmAiTitleCache: mocks.warmAiTitleCache }))
vi.mock('../../lib/indexnow', () => ({ pingIndexNow: mocks.pingIndexNow }))

const mockGetRedis = vi.mocked(getRedis)
const fake = createFakeRedis()

const today = new Date().toISOString().split('T')[0]
const thisMonth = today.slice(0, 7)
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000).toISOString().split('T')[0]

const keyFor = (sourceName: string) =>
  Object.entries(PROVIDER_NAME_MATCH).find(([, pattern]) => pattern.test(sourceName))?.[0]

const monthly = (overrides: Partial<MonthlyChanges>): MonthlyChanges => ({
  source: 'Netflix',
  month: '2026-10',
  updatedAt: 0,
  arrived: [],
  coming: [],
  departed: [],
  ...overrides
})

describe('buildTitleIndex', () => {
  it('groups arrivals, departures, and coming titles per tmdb id', () => {
    const index = buildTitleIndex([
      ['netflix', monthly({
        arrived: [{ tmdbId: 1, tmdbType: 'movie', title: 'A', date: '2026-10-05', season: null }],
        departed: [{ tmdbId: 2, tmdbType: 'tv', title: 'B', year: 2020, date: '2026-10-12' }],
        coming: [{ tmdbId: 1, tmdbType: 'movie', title: 'A', date: '2026-10-30', season: 2 }]
      })],
      ['hulu', monthly({
        arrived: [{ tmdbId: 1, tmdbType: 'movie', title: 'A', date: '2026-10-09', season: null }]
      })]
    ])

    expect(index['movie:1']?.added).toEqual([
      { p: 'netflix', date: '2026-10-05' },
      { p: 'hulu', date: '2026-10-09' }
    ])
    expect(index['movie:1']?.coming).toEqual([{ p: 'netflix', date: '2026-10-30' }])
    expect(index['tv:2']?.left).toEqual([{ p: 'netflix', date: '2026-10-12' }])
  })

  it('skips departed items without a tmdb id', () => {
    const index = buildTitleIndex([
      ['netflix', monthly({ departed: [{ tmdbId: null, tmdbType: 'movie', title: 'X', year: 2019, date: '2026-10-01' }] })]
    ])
    expect(index['movie:null']).toBeUndefined()
    expect(Object.keys(index)).toHaveLength(0)
  })

  it('indexes scheduled departures as leaving events with dates', () => {
    const index = buildTitleIndex([
      ['netflix', monthly({
        leavingSoon: [
          { tmdbId: 7, tmdbType: 'movie', title: 'Gone Soon', date: '2026-10-20', season: null },
          { tmdbId: null, tmdbType: 'tv', title: 'Unmatched', date: '2026-10-21', season: null }
        ]
      })]
    ])
    expect(index['movie:7']?.leaving).toEqual([{ p: 'netflix', date: '2026-10-20' }])
    expect(Object.keys(index)).toHaveLength(1)
  })
})

describe('getTitleChanges', () => {
  it('drops stale coming/leaving dates but keeps added/left', async () => {
    mockGetRedis.mockReturnValueOnce({
      hget: async () => ({
        coming: [{ p: 'netflix', date: '2000-01-01' }],
        leaving: [{ p: 'netflix', date: '2000-01-01' }],
        left: [{ p: 'netflix', date: '2020-05-01' }]
      })
    } as unknown as ReturnType<typeof getRedis>)
    const entry = await getTitleChanges('movie', 900001)
    expect(entry?.coming).toBeUndefined()
    expect(entry?.leaving).toBeUndefined()
    expect(entry?.left).toEqual([{ p: 'netflix', date: '2020-05-01' }])
  })

  it('keeps upcoming leaving dates', async () => {
    mockGetRedis.mockReturnValueOnce({
      hget: async () => ({ leaving: [{ p: 'hulu', date: '2999-01-01' }] })
    } as unknown as ReturnType<typeof getRedis>)
    const entry = await getTitleChanges('tv', 900002)
    expect(entry?.leaving).toEqual([{ p: 'hulu', date: '2999-01-01' }])
  })

  it('returns null when every event is stale', async () => {
    mockGetRedis.mockReturnValueOnce({
      hget: async () => ({ coming: [{ p: 'netflix', date: '2000-01-01' }] })
    } as unknown as ReturnType<typeof getRedis>)
    await expect(getTitleChanges('movie', 900003)).resolves.toBeNull()
  })
})

describe('PROVIDER_NAME_MATCH', () => {
  it.each([
    ['Netflix', 'netflix'],
    ['Netflix Basic with Ads', 'netflix'],
    ['Amazon Prime Video', 'amazon-prime-video'],
    ['Prime Video', 'amazon-prime-video'],
    ['Hulu', 'hulu'],
    ['Disney+', 'disney-plus'],
    ['Disney Plus', 'disney-plus'],
    ['Apple TV+', 'apple-tv'],
    ['Max', 'max'],
    ['HBO Max', 'max'],
    ['Peacock Premium', 'peacock'],
    ['Paramount+', 'paramount-plus'],
    ['Paramount Plus', 'paramount-plus'],
    ['Plex', 'plex'],
    ['Kanopy', 'kanopy'],
    ['Shudder', 'shudder'],
    ['The Criterion Channel', 'criterion'],
    ['Criterion Channel', 'criterion']
  ])('maps Watchmode source "%s" to "%s"', (sourceName, key) => {
    expect(keyFor(sourceName)).toBe(key)
  })

  it.each([
    'Amazon Freevee',
    'HBO',
    'Apple Store',
    'YouTube',
    // Add-on channel variants must not resolve to the base service.
    'Plex Channel',
    'Shudder Amazon Channel',
    'Kanopy Amazon Channel'
  ])('does not match "%s" to a tracked provider', (sourceName) =>
    expect(keyFor(sourceName)).toBeUndefined()
  )
})

const tmdbMovie = (id: number, title = `Film ${id}`, popularity = 50) => ({
  id, title, release_date: '2020-01-01', popularity, poster_path: `/p${id}.jpg`
})
const catalogTitle = (id: number, title = `Film ${id}`, popularity = 50) => ({
  tmdbId: id, tmdbType: 'movie' as const, title, year: 2020, popularity
})
const snapshot = (titles: ReturnType<typeof catalogTitle>[]) => ({ titles, updatedAt: 1, src: 'tmdb' })

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
  headers: { get: () => null }
}) as unknown as Response

const netflixCatalog = (ids: number[], titles: string[] = []) =>
  mocks.fetchDiscoverMovies.mockImplementation(async (opts) =>
    opts?.region === 'US' && opts.providerId === '8'
      ? { results: ids.map((id, i) => tmdbMovie(id, titles[i] || `Film ${id}`, 100 - i)), total_pages: 1 }
      : { results: [], total_pages: 1 })

const fetchStub = (body: Record<string, unknown>) =>
  vi.fn(async (url: string) => {
    if (url.includes('/releases?')) return jsonResponse({ releases: body.releases ?? [] })
    if (url.includes('title-leaving-dates')) return jsonResponse({ leaving_dates: body.leaving_dates ?? [] })
    return jsonResponse(body.sources ?? {})
  })

describe('getProviderChanges', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('returns only providers with stored diffs', async () => {
    fake.map.set('changes:diff:gpc-one', { source: 'One', updatedAt: 1, added: [], left: [], coming: [] })
    const changes = await getProviderChanges(['gpc-one', 'gpc-missing'], { fresh: true })
    expect(Object.keys(changes)).toEqual(['gpc-one'])
    expect(changes['gpc-one'].source).toBe('One')
  })

  it('returns {} when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(getProviderChanges(['x'], { fresh: true })).resolves.toEqual({})
  })

  it('memoizes repeat reads for the same key set', async () => {
    fake.map.set('changes:diff:gpc-two', { source: 'Two', updatedAt: 2, added: [], left: [], coming: [] })
    await getProviderChanges(['gpc-two'])
    const callsAfterFirst = fake.kv.get.mock.calls.length
    const again = await getProviderChanges(['gpc-two'])
    expect(again['gpc-two'].source).toBe('Two')
    expect(fake.kv.get.mock.calls.length).toBe(callsAfterFirst)
  })

  it('fresh bypasses the memo', async () => {
    fake.map.set('changes:diff:gpc-three', { source: 'V1', updatedAt: 3, added: [], left: [], coming: [] })
    await getProviderChanges(['gpc-three'])
    fake.map.set('changes:diff:gpc-three', { source: 'V2', updatedAt: 4, added: [], left: [], coming: [] })
    const fresh = await getProviderChanges(['gpc-three'], { fresh: true })
    expect(fresh['gpc-three'].source).toBe('V2')
  })

  it('reads the namespaced key for region=IN', async () => {
    fake.map.set('changes:diff:IN:gpc-four', { source: 'IN One', updatedAt: 5, added: [], left: [], coming: [] })
    const changes = await getProviderChanges(['gpc-four'], { fresh: true, region: 'IN' })
    expect(changes['gpc-four'].source).toBe('IN One')
    expect(fake.kv.get).toHaveBeenCalledWith('changes:diff:IN:gpc-four')
  })
})

describe('getProviderCatalog', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('returns stored catalog titles and memoizes them', async () => {
    fake.map.set('changes:catalog:cat-one', snapshot([catalogTitle(1), catalogTitle(2)]))
    const titles = await getProviderCatalog('cat-one')
    expect(titles).toHaveLength(2)
    await getProviderCatalog('cat-one')
    expect(fake.kv.get).toHaveBeenCalledTimes(1)
  })

  it('returns [] for a missing snapshot and caches the miss', async () => {
    await expect(getProviderCatalog('cat-missing')).resolves.toEqual([])
    await getProviderCatalog('cat-missing')
    expect(fake.kv.get).toHaveBeenCalledTimes(1)
  })

  it('returns [] when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(getProviderCatalog('cat-nokv')).resolves.toEqual([])
  })
})

describe('getMonthlyChanges', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('reads the current-month key per provider and drops misses', async () => {
    fake.map.set(`changes:monthly:mon-one:${thisMonth}`, monthly({ source: 'Mon' }))
    const changes = await getMonthlyChanges(['mon-one', 'mon-missing'])
    expect(Object.keys(changes)).toEqual(['mon-one'])
    expect(fake.kv.get).toHaveBeenCalledWith(`changes:monthly:mon-one:${thisMonth}`)
  })

  it('returns {} for an empty key list without touching Redis', async () => {
    await expect(getMonthlyChanges([])).resolves.toEqual({})
    expect(fake.kv.get).not.toHaveBeenCalled()
  })

  it('returns {} when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(getMonthlyChanges(['mon-x'])).resolves.toEqual({})
  })

  it('memoizes the month+keys combination', async () => {
    fake.map.set(`changes:monthly:mon-two:${thisMonth}`, monthly({ source: 'Mon2' }))
    await getMonthlyChanges(['mon-two'])
    const calls = fake.kv.get.mock.calls.length
    await getMonthlyChanges(['mon-two'])
    expect(fake.kv.get.mock.calls.length).toBe(calls)
  })
})

describe('getTitleChangeIndex', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('returns the whole index hash', async () => {
    const hash = { 'movie:1': { added: [{ p: 'netflix' }] } }
    fake.map.set('changes:index:US', hash)
    await expect(getTitleChangeIndex('US')).resolves.toEqual(hash)
    expect(fake.kv.hgetall).toHaveBeenCalledWith('changes:index:US')
  })

  it('returns null without Redis', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(getTitleChangeIndex()).resolves.toBeNull()
  })
})

describe('updateStreamingChanges', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
    vi.stubEnv('WATCHMODE_API_KEY', 'test-key')
    vi.stubGlobal('fetch', fetchStub({}))
    fake.map.set('changes:sources', { netflix: { id: 203, name: 'Netflix' } })
    mocks.fetchDiscoverMovies.mockResolvedValue({ results: [], total_pages: 1 })
    mocks.fetchDiscoverTv.mockResolvedValue({ results: [], total_pages: 1 })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns an error object when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(updateStreamingChanges()).resolves.toEqual({ error: 'Redis unavailable' })
  })

  it('seeds the baseline with no diff on the first run', async () => {
    netflixCatalog([1, 2])
    const summary = await updateStreamingChanges()
    expect(summary.netflix).toEqual({ added: 0, left: 0, coming: 0, catalog: 2 })
    const stored = fake.map.get('changes:catalog:netflix') as { titles: unknown[]; src: string }
    expect(stored.titles).toHaveLength(2)
    expect(stored.src).toBe('tmdb')
    const diff = fake.map.get('changes:diff:netflix') as { added: unknown[]; left: unknown[] }
    expect(diff.added).toEqual([])
    expect(diff.left).toEqual([])
  })

  it('computes added/left against the stored baseline and accumulates monthly', async () => {
    fake.map.set('changes:catalog:netflix', snapshot([catalogTitle(1), catalogTitle(2)]))
    netflixCatalog([2, 3])
    const summary = await updateStreamingChanges()

    expect(summary.netflix).toEqual({ added: 1, left: 1, coming: 0, catalog: 2 })
    const diff = fake.map.get('changes:diff:netflix') as { added: { tmdbId: number }[]; left: { tmdbId: number }[] }
    expect(diff.added.map((t) => t.tmdbId)).toEqual([3])
    expect(diff.left.map((t) => t.tmdbId)).toEqual([1])

    const monthlyStored = fake.map.get(`changes:monthly:netflix:${thisMonth}`) as MonthlyChanges
    expect(monthlyStored.arrived.map((t) => t.tmdbId)).toEqual([3])
    expect(monthlyStored.arrived[0].date).toBe(today)
    expect(monthlyStored.departed.map((t) => t.tmdbId)).toEqual([1])
    expect(monthlyStored.departed[0].date).toBe(today)

    const urls = mocks.pingIndexNow.mock.calls[0][0]
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringContaining('/movies/3'),
      expect.stringContaining('/movies/1'),
      expect.stringContaining('/streaming/netflix'),
      expect.stringContaining('/leaving/netflix'),
      expect.stringContaining('/new-on-streaming')
    ]))
    expect(mocks.warmAiTitleCache).toHaveBeenCalled()
  })

  it('reseeds quietly when the stored snapshot lacks the tmdb marker', async () => {
    fake.map.set('changes:catalog:netflix', { titles: [catalogTitle(9)], updatedAt: 1 })
    netflixCatalog([1])
    const summary = await updateStreamingChanges()
    expect(summary.netflix).toEqual({ added: 0, left: 0, coming: 0, catalog: 1 })
    expect((fake.map.get('changes:catalog:netflix') as { src: string }).src).toBe('tmdb')
  })

  it('skips a provider whose catalog fetch comes back empty', async () => {
    fake.map.set('changes:catalog:netflix', snapshot([catalogTitle(7)]))
    netflixCatalog([]) // TMDB hiccup — must not wipe the baseline
    const summary = await updateStreamingChanges()
    expect(summary.netflix).toBe('skipped: empty catalog')
    const stored = fake.map.get('changes:catalog:netflix') as { titles: unknown[] }
    expect(stored.titles).toHaveLength(1)
  })

  it('resolves coming releases and leaving-soon titles', async () => {
    vi.stubGlobal('fetch', fetchStub({
      releases: [
        { source_id: 203, tmdb_id: 500, tmdb_type: 'movie', type: 'movie', title: 'Soon Film', source_release_date: daysFromNow(5) },
        { source_id: 203, tmdb_id: 501, tmdb_type: 'movie', type: 'movie', title: 'Out Today', source_release_date: today },
        { source_id: 999, tmdb_id: 502, type: 'movie', title: 'Other Source', source_release_date: daysFromNow(5) },
        { source_id: 203, tmdb_id: null, type: 'movie', title: 'No TMDB', source_release_date: daysFromNow(5) }
      ],
      leaving_dates: [
        { id: 9, title: 'Film One!', title_type: 'movie', provider_id: 203, leaving_date: daysFromNow(10) }
      ]
    }))
    fake.map.set('changes:catalog:netflix', snapshot([catalogTitle(1, 'Film One')]))
    netflixCatalog([1], ['Film One!'])
    const summary = await updateStreamingChanges()

    expect(summary.netflix).toEqual({ added: 0, left: 0, coming: 1, catalog: 1 })
    const diff = fake.map.get('changes:diff:netflix') as {
      coming: { tmdbId: number; date: string }[]
      leavingSoon: { tmdbId: number | null; title: string; date: string }[]
    }
    // Only the future-dated release lands in coming; today's release counts as arrived.
    expect(diff.coming).toEqual([expect.objectContaining({ tmdbId: 500, date: daysFromNow(5) })])
    // 'Film One!' normalizes to 'film one' — matches the catalog title.
    expect(diff.leavingSoon).toEqual([
      expect.objectContaining({ tmdbId: 1, title: 'Film One!', date: daysFromNow(10) })
    ])

    const monthlyStored = fake.map.get(`changes:monthly:netflix:${thisMonth}`) as MonthlyChanges
    expect(monthlyStored.arrived.map((t) => t.tmdbId)).toEqual([501])
    expect(monthlyStored.coming.map((t) => t.tmdbId)).toEqual([500])

    const index = fake.map.get('changes:index:US') as Record<string, { coming?: { p: string }[]; leaving?: { p: string }[] }>
    expect(index['movie:500']?.coming).toEqual([{ p: 'netflix', date: daysFromNow(5) }])
    expect(index['movie:1']?.leaving).toEqual([{ p: 'netflix', date: daysFromNow(10) }])
  })

  it('carries the scheduled departure date onto departed entries', async () => {
    fake.map.set('changes:catalog:netflix', snapshot([catalogTitle(1)]))
    fake.map.set('changes:diff:netflix', {
      source: 'Netflix', updatedAt: 1, added: [], left: [], coming: [],
      leavingSoon: [{ tmdbId: 1, tmdbType: 'movie', title: 'Film 1', date: daysFromNow(2), season: null }]
    })
    netflixCatalog([])
    // Catalog fetch empty would skip — give it a different single title so 1 shows as left.
    mocks.fetchDiscoverMovies.mockImplementation(async (opts) =>
      opts?.region === 'US' && opts.providerId === '8'
        ? { results: [tmdbMovie(4, 'Replacement', 80)], total_pages: 1 }
        : { results: [], total_pages: 1 })
    await updateStreamingChanges()
    const monthlyStored = fake.map.get(`changes:monthly:netflix:${thisMonth}`) as MonthlyChanges
    const departed = monthlyStored.departed.find((t) => t.tmdbId === 1)
    expect(departed?.date).toBe(daysFromNow(2))
  })

  it('accumulates across the stored monthly record', async () => {
    fake.map.set('changes:catalog:netflix', snapshot([catalogTitle(1)]))
    fake.map.set(`changes:monthly:netflix:${thisMonth}`, monthly({
      arrived: [{ tmdbId: 8, tmdbType: 'movie', title: 'Earlier', date: '2026-01-02', season: null }],
      departed: [{ tmdbId: 3, tmdbType: 'movie', title: 'Long Gone', year: 2010, date: '2026-01-04' }]
    }))
    netflixCatalog([3, 1])
    await updateStreamingChanges()

    const monthlyStored = fake.map.get(`changes:monthly:netflix:${thisMonth}`) as MonthlyChanges
    // Title 3 returning to the catalog is removed from departed and lands in arrived.
    expect(monthlyStored.departed.find((t) => t.tmdbId === 3)).toBeUndefined()
    expect(monthlyStored.arrived.map((t) => t.tmdbId).sort()).toEqual([3, 8])
  })

  it('caps the daily diff payload at 40 per list while summary counts stay honest', async () => {
    fake.map.set('changes:catalog:netflix', snapshot([]))
    netflixCatalog(Array.from({ length: 45 }, (_, i) => 100 + i))
    const summary = await updateStreamingChanges()
    expect((summary.netflix as { added: number }).added).toBe(45)
    const diff = fake.map.get('changes:diff:netflix') as { added: unknown[] }
    expect(diff.added).toHaveLength(40)
  })

  it('merges movie and tv catalog items under the shared 250 cap', async () => {
    mocks.fetchDiscoverMovies.mockImplementation(async (opts) =>
      opts?.region === 'US' && opts.providerId === '8'
        ? { results: Array.from({ length: 250 }, (_, i) => tmdbMovie(1000 + i, `M${i}`, 5)), total_pages: 1 }
        : { results: [], total_pages: 1 })
    mocks.fetchDiscoverTv.mockImplementation(async (opts) =>
      opts?.region === 'US' && opts.providerId === '8'
        ? { results: Array.from({ length: 250 }, (_, i) => ({ ...tmdbMovie(2000 + i, `T${i}`, 50), name: `T${i}`, first_air_date: '2020-01-01' })), total_pages: 1 }
        : { results: [], total_pages: 1 })
    const summary = await updateStreamingChanges()
    expect((summary.netflix as { catalog: number }).catalog).toBe(250)
    const stored = fake.map.get('changes:catalog:netflix') as { titles: { tmdbType: string }[] }
    // Higher-popularity tv titles outrank the movies — not insertion-order clobbered.
    expect(stored.titles.filter((t) => t.tmdbType === 'tv').length).toBe(250)
    expect(stored.titles.filter((t) => t.tmdbType === 'movie').length).toBe(0)
  })

  it('records an error when no Watchmode sources resolve', async () => {
    fake.map.delete('changes:sources')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false)))
    const summary = await updateStreamingChanges()
    expect(summary.error).toBe('No Watchmode sources resolved')
    expect(summary.netflix).toBeUndefined()
  })

  it('writes a namespaced IN diff for IN-available providers', async () => {
    mocks.fetchDiscoverMovies.mockImplementation(async (opts) => {
      if (opts?.providerId === '8' && opts.region === 'US') return { results: [tmdbMovie(1)], total_pages: 1 }
      if (opts?.providerId === '8' && opts.region === 'IN') return { results: [tmdbMovie(77, 'IN Film', 60)], total_pages: 1 }
      return { results: [], total_pages: 1 }
    })
    const summary = await updateStreamingChanges()
    expect((summary['in:netflix'] as { catalog: number }).catalog).toBe(1)
    const inDiff = fake.map.get('changes:diff:IN:netflix') as { coming: unknown[]; added: unknown[] }
    expect(inDiff.coming).toEqual([]) // IN diffs never carry coming data
    expect(inDiff.added).toEqual([])  // no baseline -> seed only
    expect(fake.map.has('changes:catalog:IN:netflix')).toBe(true)
  })

  it('feeds trending titles into IndexNow and the warm set', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/trending/movie/week') return { results: [{ id: 900, title: 'Hot Film', popularity: 90 }] }
      if (path === '/trending/tv/week') return { results: [{ id: 901, name: 'Hot Show', popularity: 80 }] }
      if (path === '/discover/movie') return { results: [{ id: 902, title: 'Next Week', overview: 'o', release_date: daysFromNow(3), popularity: 10 }] }
      return { results: [] }
    })
    netflixCatalog([1])
    const summary = await updateStreamingChanges()
    const urls = mocks.pingIndexNow.mock.calls[0][0]
    expect(urls).toEqual(expect.arrayContaining([
      expect.stringContaining('/movies/900'),
      expect.stringContaining('/tv/901'),
      expect.stringContaining('/movies/902')
    ]))
    const warmed = mocks.warmAiTitleCache.mock.calls[0][0] ?? []
    expect(warmed.map((w) => w.id)).toEqual(expect.arrayContaining([900, 901, 902]))
    expect(summary.aiWarm).toBe(0)
  })
})
