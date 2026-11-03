import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getRedis } from '../../lib/redis'
import { getDigitalReleases, updateDigitalReleases } from './digitalReleases'
import { createFakeRedis } from '../../__tests__/helpers/mockApi'

const mocks = vi.hoisted(() => ({
  fetchTmdb: vi.fn<(path?: string) => Promise<unknown>>(async () => ({ results: [] }))
}))

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
vi.mock('./tmdb', () => ({ fetchTmdb: mocks.fetchTmdb }))

const mockGetRedis = vi.mocked(getRedis)
const fake = createFakeRedis()

const movie = (id: number, title = `Film ${id}`, popularity = 50) => ({
  id,
  title,
  popularity,
  poster_path: `/p${id}.jpg`
})
const usRelease = (type: number, date: string) => ({
  iso_3166_1: 'US',
  release_dates: [{ type, release_date: `${date}T00:00:00.000Z` }]
})

describe('updateDigitalReleases', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('confirms only US type-4 dates and stores them under the release month', async () => {
    mocks.fetchTmdb.mockImplementation(async (path) => {
      if (path === '/discover/movie') return { results: [movie(1), movie(2), movie(3)], total_pages: 1, total_results: 3 }
      if (path === '/movie/1/release_dates') {
        return {
          results: [
            usRelease(3, '2026-10-01'), // theatrical — ignored
            usRelease(4, '2026-11-15') // digital — wins
          ]
        }
      }
      if (path === '/movie/2/release_dates') return { results: [usRelease(3, '2026-11-01')] }
      if (path === '/movie/3/release_dates') {
        return { results: [{ iso_3166_1: 'GB', release_dates: [{ type: 4, release_date: '2026-11-02T00:00:00.000Z' }] }] }
      }
      return { results: [] }
    })

    const summary = await updateDigitalReleases()
    expect(summary).toEqual({ scanned: 3, confirmed: 1, months: 1 })

    const stored = fake.map.get('digital:movie:2026-11') as Record<string, { id: number; date: string }>
    expect(stored['1']).toMatchObject({ id: 1, date: '2026-11-15' })
    expect(stored['2']).toBeUndefined()
    expect(stored['3']).toBeUndefined()
  })

  it('returns zeros when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(updateDigitalReleases()).resolves.toEqual({ scanned: 0, confirmed: 0, months: 0 })
  })
})

describe('getDigitalReleases', () => {
  beforeEach(() => {
    fake.map.clear()
    vi.clearAllMocks()
    mockGetRedis.mockReturnValue(fake.kv as unknown as ReturnType<typeof getRedis>)
  })

  it('groups stored releases by date inside the window and sorts by popularity', async () => {
    fake.map.set('digital:movie:2026-11', {
      '1': { id: 1, title: 'A', date: '2026-11-15', poster: null, pop: 10, upd: 1 },
      '2': { id: 2, title: 'B', date: '2026-11-15', poster: null, pop: 90, upd: 1 },
      '3': { id: 3, title: 'C', date: '2026-11-20', poster: null, pop: 50, upd: 1 },
      '4': { id: 4, title: 'Out of window', date: '2027-05-01', poster: null, pop: 99, upd: 1 }
    })
    const days = await getDigitalReleases('2026-11-01', '2026-11-30')
    expect(days.map((d) => d.date)).toEqual(['2026-11-15', '2026-11-20'])
    expect(days[0].releases.map((r) => r.id)).toEqual([2, 1])
  })

  it('dedupes a title whose date moved months, keeping the newest write', async () => {
    fake.map.set('digital:movie:2026-01', {
      '5': { id: 5, title: 'Mover', date: '2026-01-10', poster: null, pop: 10, upd: 100 }
    })
    fake.map.set('digital:movie:2026-02', {
      '5': { id: 5, title: 'Mover', date: '2026-02-05', poster: null, pop: 10, upd: 200 }
    })
    const days = await getDigitalReleases('2026-01-01', '2026-03-01')
    const all = days.flatMap((d) => d.releases)
    expect(all).toHaveLength(1)
    expect(all[0].date).toBe('2026-02-05')
  })

  it('returns [] when Redis is unavailable', async () => {
    mockGetRedis.mockReturnValueOnce(null)
    await expect(getDigitalReleases('2026-11-01', '2026-11-30')).resolves.toEqual([])
  })
})
