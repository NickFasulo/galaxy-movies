import { describe, expect, it, vi } from 'vitest'
import { getRedis } from '../../lib/redis'
import { PROVIDER_NAME_MATCH } from './tmdb'
import { buildTitleIndex, getTitleChanges, type MonthlyChanges } from './streamingChanges'

vi.mock('../../lib/redis', () => ({ getRedis: vi.fn(() => null) }))
const mockGetRedis = vi.mocked(getRedis)

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
