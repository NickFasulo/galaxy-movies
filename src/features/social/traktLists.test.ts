import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildTraktLists } from './traktLists'

const mocks = vi.hoisted(() => ({
  getProviderChanges: vi.fn(),
  getMonthlyChanges: vi.fn()
}))

vi.mock('../catalog/streamingChanges', () => ({
  getProviderChanges: mocks.getProviderChanges,
  getMonthlyChanges: mocks.getMonthlyChanges
}))
vi.mock('./socialBroadcast', () => ({
  BROADCAST_PROVIDERS: ['netflix', 'hulu'],
  providerLabel: (k: string) => (k === 'netflix' ? 'Netflix' : 'Hulu')
}))

const addedOf = (tmdbId: number, tmdbType: 'movie' | 'tv', popularity = 1) => ({
  tmdbId,
  tmdbType,
  title: `T${tmdbId}`,
  year: 2025,
  popularity
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getProviderChanges.mockResolvedValue({
    netflix: { added: [addedOf(1, 'movie', 90), addedOf(2, 'tv', 80)], left: [], coming: [], leavingSoon: [] },
    hulu: { added: [addedOf(3, 'movie', 70)], left: [], coming: [], leavingSoon: [] }
  })
  mocks.getMonthlyChanges.mockResolvedValue({
    netflix: {
      departed: [{ ...addedOf(4, 'movie', 60), date: '2026-03-01' }],
      leavingSoon: [{ ...addedOf(5, 'tv', 50), date: '2026-03-30', season: null }]
    },
    hulu: { departed: [], leavingSoon: [] }
  })
})

describe('buildTraktLists', () => {
  it('plans the departures list first, then per-provider lists', async () => {
    const plan = await buildTraktLists()
    expect(plan.lists.map((l) => l.name)).toEqual([
      expect.stringMatching(/^Leaving Soon \d{4}-\d{2}$/),
      'New on Netflix this week',
      'New on Hulu this week'
    ])
    const netflix = plan.lists[1]
    expect(netflix.movies).toEqual([1])
    expect(netflix.shows).toEqual([2])
    expect(netflix.description).toContain('galaxymovies.app')
  })

  it('skips providers with no arrivals', async () => {
    mocks.getProviderChanges.mockResolvedValue({
      netflix: { added: [], left: [], coming: [], leavingSoon: [] },
      hulu: { added: [addedOf(3, 'movie', 70)], left: [], coming: [], leavingSoon: [] }
    })
    const plan = await buildTraktLists()
    expect(plan.skipped).toContain('New on Netflix this week')
    expect(plan.lists.some((l) => l.name === 'New on Netflix this week')).toBe(false)
  })

  it('skips the departures list when nothing left or is leaving', async () => {
    mocks.getMonthlyChanges.mockResolvedValue({})
    const plan = await buildTraktLists()
    expect(plan.lists.some((l) => l.name.startsWith('Leaving Soon'))).toBe(false)
    expect(plan.skipped.some((n) => n.startsWith('Leaving Soon'))).toBe(true)
  })

  it('caps at 50 by popularity and dedupes departures across providers', async () => {
    mocks.getProviderChanges.mockResolvedValue({
      netflix: { added: Array.from({ length: 60 }, (_, i) => addedOf(i + 1, 'movie', i)), left: [], coming: [], leavingSoon: [] },
      hulu: { added: [], left: [], coming: [], leavingSoon: [] }
    })
    const dup = { ...addedOf(7, 'movie', 42), date: '2026-03-05' }
    mocks.getMonthlyChanges.mockResolvedValue({
      netflix: { departed: [dup], leavingSoon: [{ ...addedOf(7, 'movie', 42), date: '2026-03-20', season: null }] },
      hulu: { departed: [], leavingSoon: [] }
    })
    const plan = await buildTraktLists()
    const netflix = plan.lists.find((l) => l.name === 'New on Netflix this week')!
    expect(netflix.movies).toHaveLength(50)
    expect(netflix.movies[0]).toBe(60)
    const leaving = plan.lists.find((l) => l.name.startsWith('Leaving Soon'))!
    expect(leaving.movies.length + leaving.shows.length).toBe(1)
  })
})
