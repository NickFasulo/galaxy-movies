import { describe, expect, it } from 'vitest'
import { buildIcs, comingEvents, episodeEvents, premiereEvents, toIcsDate } from './calendar'
import type { ProviderChanges } from './streamingChanges'
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
