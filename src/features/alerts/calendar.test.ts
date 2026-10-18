import { describe, expect, it, vi } from 'vitest'
import { buildIcs, comingEvents, episodeEvents, loadUpcomingEpisodes, loadUpcomingPremieres, premiereEvents, toIcsDate } from './calendar'

const nextEp = vi.hoisted(() => vi.fn())
vi.mock('./watchlistAlerts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./watchlistAlerts')>()),
  fetchNextEpisode: nextEp
}))

const fetchTmdb = vi.hoisted(() => vi.fn())
vi.mock('../catalog/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../catalog/tmdb')>()),
  fetchTmdb
}))
import type { ProviderChanges } from '../catalog/streamingChanges'
import type { AlertPrefs } from './watchlistAlerts'

const prefs = (overrides: Partial<AlertPrefs> = {}): AlertPrefs => ({
  watchlist: [{ id: 1, mediaType: 'movie', title: 'Film' }],
  services: ['netflix'],
  region: 'US',
  updatedAt: 0,
  ...overrides
})

const changes = (overrides: Partial<ProviderChanges> = {}): ProviderChanges => ({
  source: 'Netflix',
  updatedAt: 1700000000000,
  added: [],
  left: [],
  coming: [],
  ...overrides
})

describe('toIcsDate', () => {
  it('normalizes dashed and compact dates', () => {
    expect(toIcsDate('2026-01-15')).toBe('20260115')
    expect(toIcsDate('20260115')).toBe('20260115')
  })

  it('rolls over month and year boundaries', () => {
    expect(toIcsDate('2026-12-31', 1)).toBe('20270101')
    expect(toIcsDate('2026-01-31', 1)).toBe('20260201')
  })

  it('returns null for garbage input', () => {
    expect(toIcsDate('')).toBeNull()
    expect(toIcsDate('soon')).toBeNull()
  })
})

describe('comingEvents', () => {
  it('emits an event for a coming release on the watchlist', () => {
    const events = comingEvents(prefs(), {
      netflix: changes({ coming: [{ tmdbId: 1, tmdbType: 'movie', title: 'Film', date: '2026-02-01', season: null }] })
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ uid: 'netflix:movie:1@galaxymovies.app', date: '2026-02-01' })
    expect(events[0]!.summary).toBe('Film comes to Netflix')
    expect(events[0]!.url).toContain('/movies/1')
  })

  it('includes the season for tv releases and skips non-watchlisted titles', () => {
    const events = comingEvents(prefs({ watchlist: [{ id: 1, mediaType: 'tv', title: 'Show' }] }), {
      netflix: changes({ coming: [
        { tmdbId: 1, tmdbType: 'tv', title: 'Show', date: '2026-02-01', season: 3 },
        { tmdbId: 2, tmdbType: 'tv', title: 'Other', date: '2026-02-01', season: null }
      ] })
    })
    expect(events).toHaveLength(1)
    expect(events[0]!.summary).toBe('Show season 3 comes to Netflix')
    expect(events[0]!.url).toContain('/tv/1')
  })

  it('skips coming entries without a date', () => {
    const events = comingEvents(prefs(), {
      netflix: changes({ coming: [{ tmdbId: 1, tmdbType: 'movie', title: 'Film', date: '', season: null }] })
    })
    expect(events).toHaveLength(0)
  })
})

describe('episodeEvents', () => {
  it('emits an air-date event for a watchlisted show', () => {
    const events = episodeEvents(
      prefs({ watchlist: [{ id: 1, mediaType: 'tv', title: 'Show' }] }),
      new Map([[1, { airDate: '2026-03-02', season: 2, episode: 5 }]])
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ date: '2026-03-02', summary: 'Show S2E5 airs' })
    expect(events[0]!.url).toContain('/tv/1')
  })

  it('omits the SxEy tag when numbering is missing and skips movies', () => {
    const events = episodeEvents(prefs(), new Map([[1, { airDate: '2026-03-02', season: null, episode: null }]]))
    expect(events).toHaveLength(0)
    const unnumbered = episodeEvents(
      prefs({ watchlist: [{ id: 1, mediaType: 'tv', title: 'Show' }] }),
      new Map([[1, { airDate: '2026-03-02', season: null, episode: null }]])
    )
    expect(unnumbered[0]!.summary).toBe('Show airs')
  })
})

describe('premiereEvents', () => {
  it('emits a theater event for a watchlisted movie', () => {
    const events = premiereEvents(prefs(), new Map([[1, '2026-04-10']]))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ date: '2026-04-10', summary: 'Film premieres in theaters' })
  })

  it('skips shows and movies without a premiere date', () => {
    expect(premiereEvents(prefs({ watchlist: [{ id: 1, mediaType: 'tv', title: 'Show' }] }), new Map([[1, '2026-04-10']]))).toHaveLength(0)
    expect(premiereEvents(prefs(), new Map())).toHaveLength(0)
  })
})

describe('buildIcs', () => {
  it('produces a valid VCALENDAR with CRLF line endings', () => {
    const ics = buildIcs([{
      uid: 'netflix:movie:1@galaxymovies.app',
      date: '2026-02-01',
      summary: 'Film, "One" comes to Netflix',
      url: 'https://www.galaxymovies.app/movies/1',
      stamp: 1700000000000
    }])
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260201')
    expect(ics).toContain('DTEND;VALUE=DATE:20260202')
    expect(ics).toContain('SUMMARY:Film\\, "One" comes to Netflix')
    expect(ics).toMatch(/END:VCALENDAR\r\n$/)
  })
})

const futureDate = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

describe('loadUpcomingEpisodes', () => {
  it('fetches only cache misses and returns non-null episodes', async () => {
    nextEp.mockReset()
    nextEp.mockImplementation(async (id: number) =>
      id === 101 ? { airDate: futureDate(5), season: 1, episode: 2 } : null
    )
    const first = await loadUpcomingEpisodes([101, 102, 103])
    expect(first.get(101)).toMatchObject({ season: 1, episode: 2 })
    expect(first.has(102)).toBe(false)
    expect(nextEp).toHaveBeenCalledTimes(3)

    const second = await loadUpcomingEpisodes([101, 102, 103])
    expect(nextEp).toHaveBeenCalledTimes(3)
    expect(second.get(101)).toMatchObject({ episode: 2 })
  })

  it('caps detail fetches at 25', async () => {
    nextEp.mockReset()
    nextEp.mockResolvedValue(null)
    const ids = Array.from({ length: 40 }, (_, i) => 300 + i)
    await loadUpcomingEpisodes(ids)
    expect(nextEp).toHaveBeenCalledTimes(25)
  })
})

const releaseDates = (region: string, dates: { type?: number; release_date: string }[]) => ({
  results: [{ iso_3166_1: region, release_dates: dates }]
})

describe('loadUpcomingPremieres', () => {
  it('prefers the theatrical (type 3) date even when another type is sooner', async () => {
    fetchTmdb.mockReset()
    fetchTmdb.mockResolvedValue(releaseDates('US', [
      { type: 4, release_date: `${futureDate(5)}T00:00:00.000Z` },
      { type: 3, release_date: `${futureDate(30)}T00:00:00.000Z` }
    ]))
    const index = await loadUpcomingPremieres([401], 'US')
    expect(index.get(401)).toBe(futureDate(30))
  })

  it('falls back to the earliest future release when no theatrical type exists', async () => {
    fetchTmdb.mockReset()
    fetchTmdb.mockResolvedValue(releaseDates('US', [
      { type: 4, release_date: `${futureDate(20)}T00:00:00.000Z` },
      { type: 6, release_date: `${futureDate(9)}T00:00:00.000Z` }
    ]))
    const index = await loadUpcomingPremieres([402], 'US')
    expect(index.get(402)).toBe(futureDate(9))
  })

  it('uses the subscriber region, then US, then whatever region exists', async () => {
    fetchTmdb.mockReset()
    fetchTmdb.mockImplementation(async () => ({
      results: [
        { iso_3166_1: 'US', release_dates: [{ type: 3, release_date: `${futureDate(50)}T00:00:00.000Z` }] },
        { iso_3166_1: 'IN', release_dates: [{ type: 3, release_date: `${futureDate(10)}T00:00:00.000Z` }] }
      ]
    }))
    expect((await loadUpcomingPremieres([403], 'IN')).get(403)).toBe(futureDate(10))

    fetchTmdb.mockImplementation(async () => ({
      results: [{ iso_3166_1: 'GB', release_dates: [{ type: 3, release_date: `${futureDate(7)}T00:00:00.000Z` }] }]
    }))
    expect((await loadUpcomingPremieres([404], 'IN')).get(404)).toBe(futureDate(7))
  })

  it('returns nothing for movies with only past releases or upstream errors', async () => {
    fetchTmdb.mockReset()
    fetchTmdb.mockResolvedValue(releaseDates('US', [
      { type: 3, release_date: '2020-01-01T00:00:00.000Z' }
    ]))
    expect((await loadUpcomingPremieres([405], 'US')).has(405)).toBe(false)

    fetchTmdb.mockRejectedValue(new Error('tmdb down'))
    expect((await loadUpcomingPremieres([406], 'US')).has(406)).toBe(false)
  })
})
