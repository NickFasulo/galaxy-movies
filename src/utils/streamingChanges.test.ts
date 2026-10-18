import { describe, expect, it } from 'vitest'
import { PROVIDER_NAME_MATCH } from './tmdb'
import { buildTitleIndex, type MonthlyChanges } from './streamingChanges'

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
    ['Paramount Plus', 'paramount-plus']
  ])('maps Watchmode source "%s" to "%s"', (sourceName, key) => {
    expect(keyFor(sourceName)).toBe(key)
  })

  it.each(['Amazon Freevee', 'HBO', 'Apple Store', 'YouTube'])(
    'does not match "%s" to a tracked provider',
    (sourceName) => expect(keyFor(sourceName)).toBeUndefined()
  )
})
