import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import { getLatestCharts, updateCharts, type ChartRow } from './charts'
import { createFakeRedis } from '../../__tests__/helpers/mockApi'

const mocks = vi.hoisted(() => ({
  searchMovieByTitle: vi.fn<(t?: string) => Promise<{ id: number; title: string } | null>>(async () => null),
  searchTvByTitle: vi.fn<(t?: string) => Promise<{ id: number; title: string } | null>>(async () => null)
}))

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('./tmdb', () => ({
  searchMovieByTitle: mocks.searchMovieByTitle,
  searchTvByTitle: mocks.searchTvByTitle
}))

const mockGetRedis = vi.mocked(getRedis)
const fake = createFakeRedis()
const today = new Date().toISOString().slice(0, 10)

const COUNTRIES_TSV = [
  'country_iso2\tcountry_name\tweek\tcategory\tweekly_rank\tshow_title\tseason_title\tcumulative_weeks_in_top_10\tis_staggered_launch\tepisode_launch_details\tweekly_hours_viewed\tweekly_views',
  'US\tUnited States\t2026-10-19\tFilms (English)\t1\tBig Film\t\t3\tFALSE\t\t50000000\t6000000',
  'US\tUnited States\t2026-10-19\tTV (English)\t1\tBig Show\tSeason 1\t5\tFALSE\t\t90000000\t10000000',
  'US\tUnited States\t2026-10-12\tFilms (English)\t1\tOld Week Film\t\t1\tFALSE\t\t1000\t100',
  'IN\tIndia\t2026-10-19\tFilms (English)\t2\tIndia Film\t\t1\tFALSE\t\t2000\t200',
  'FR\tFrance\t2026-10-19\tFilms (English)\t1\tIgnored Country Film\t\t1\tFALSE\t\t1\t1'
].join('\n')

const GLOBAL_TSV = [
  'week\tcategory\tweekly_rank\tshow_title\tseason_title\tweekly_hours_viewed\truntime\tweekly_views\tcumulative_weeks_in_top_10',
  '2026-10-19\tFilms (English)\t1\tGlobal Film\t\t80000000\t2:00\t12000000\t2'
].join('\n')

const appleFeed = (titles: string[]) => ({
  feed: {
    entry: titles.map((t, i) => ({
      'im:name': { label: t },
      id: { attributes: { 'im:id': `${1000 + i}` } }
    }))
  }
})

const textResponse = (text: string, ok = true) => ({ ok, text: async () => text }) as unknown as Response
const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response

const stubAll = (overrides: Record<string, unknown> = {}) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('all-weeks-countries.tsv')) return textResponse(String(overrides.countries ?? COUNTRIES_TSV))
    if (url.includes('all-weeks-global.tsv')) return textResponse(String(overrides.global ?? GLOBAL_TSV))
    if (url.includes('api.trakt.tv')) {
      return jsonResponse(
        overrides.trakt ?? [{ watchers: 10, movie: { title: 'Trakt Film', year: 2025, ids: { tmdb: 5 } } }]
      )
    }
    if (url.includes('itunes.apple.com')) return jsonResponse(overrides.apple ?? appleFeed(['Store Film', 'Second Film']))
    return jsonResponse({})
  })

describe('updateCharts', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
    vi.stubEnv('TRAKT_CLIENT_ID', 'test-trakt')
    vi.stubGlobal('fetch', stubAll())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('stores netflix weekly rows per country+category and keeps only the latest week', async () => {
    const summary = await updateCharts()
    expect(summary.netflixWeek).toBe('2026-10-19')

    const hash = fake.map.get('charts:netflix:2026-10-19') as Record<string, ChartRow[]>
    const usFilms = hash['US:films-en']
    expect(usFilms).toHaveLength(1)
    expect(usFilms[0]).toMatchObject({ r: 1, t: 'Big Film', w: 3, v: 6000000, h: 50000000 })
    expect(hash['US:tv-en'][0]).toMatchObject({ t: 'Big Show', w: 5 })
    expect(hash['IN:films-en'][0]).toMatchObject({ t: 'India Film' })
    expect(hash['US:films-en'].some((r) => r.t === 'Old Week Film')).toBe(false)
    expect(hash['FR:films-en']).toBeUndefined()
    expect(hash['global:films-en'][0]).toMatchObject({ t: 'Global Film', v: 12000000 })
  })

  it('stores trakt buckets with tmdb ids and metric numbers', async () => {
    vi.stubGlobal('fetch', stubAll({
      trakt: [
        { watchers: 1234, movie: { title: 'Hot Film', year: 2025, ids: { tmdb: 42 } } },
        { watchers: 900, movie: { title: 'Other Film', year: 2024, ids: { tmdb: 7 } } }
      ]
    }))
    await updateCharts()
    const hash = fake.map.get(`charts:trakt:${today}`) as Record<string, ChartRow[]>
    // Every trakt list returns the same stub — trending bucket should carry it.
    expect(hash['trending:movie'][0]).toMatchObject({ r: 1, t: 'Hot Film', id: 42, y: 2025, n: 1234 })
    expect(hash['weekly:movie']).toHaveLength(2)
  })

  it('stores apple chart rows with store ids', async () => {
    await updateCharts()
    const hash = fake.map.get(`charts:apple:${today}`) as Record<string, ChartRow[]>
    expect(hash['us:movies'][0]).toMatchObject({ r: 1, t: 'Store Film', sid: '1000' })
    expect(hash['us:tv'][0]).toMatchObject({ t: 'Store Film' })
    expect(hash['in:movies']).toHaveLength(2)
  })

  it('resolves chart titles to tmdb ids and caches the lookup', async () => {
    mocks.searchMovieByTitle.mockImplementation(async (t) => (t === 'Big Film' ? { id: 42, title: 'Big Film' } : null))
    await updateCharts()
    const hash = fake.map.get('charts:netflix:2026-10-19') as Record<string, ChartRow[]>
    expect(hash['US:films-en'][0].id).toBe(42)
    expect(hash['IN:films-en'][0].id).toBeUndefined() // 'India Film' unresolved — row kept anyway
    const cache = fake.map.get('charts:resolve:movie') as Record<string, number>
    expect(cache['big film']).toBe(42)

    await updateCharts()
    const calls = mocks.searchMovieByTitle.mock.calls.length
    await updateCharts()
    expect(mocks.searchMovieByTitle.mock.calls.length).toBe(calls) // cache hit — no repeat lookups
  })

  it('skips trakt entirely without a client id', async () => {
    vi.stubEnv('TRAKT_CLIENT_ID', '')
    const summary = await updateCharts()
    expect(summary.trakt).toBe(0)
    expect(fake.map.has(`charts:trakt:${today}`)).toBe(false)
    expect(summary.netflix).toBeGreaterThan(0)
  })

  it('points charts:latest at each stored period', async () => {
    await updateCharts()
    const latest = fake.map.get('charts:latest') as Record<string, string>
    expect(latest.trakt).toBe(`charts:trakt:${today}`)
    expect(latest.netflix).toBe('charts:netflix:2026-10-19')
    expect(latest.apple).toBe(`charts:apple:${today}`)
  })
})

describe('getLatestCharts', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
    vi.stubEnv('TRAKT_CLIENT_ID', 'test-trakt')
    vi.stubGlobal('fetch', stubAll())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns the latest snapshot for all three sources', async () => {
    await updateCharts()
    const feed = await getLatestCharts()
    expect(feed?.netflix?.week).toBe('2026-10-19')
    expect(feed?.netflix?.buckets['US:films-en'][0].t).toBe('Big Film')
    expect(feed?.trakt?.date).toBe(today)
    expect(feed?.apple?.date).toBe(today)
  })

  it('returns null without Redis', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(getLatestCharts()).resolves.toBeNull()
  })
})
