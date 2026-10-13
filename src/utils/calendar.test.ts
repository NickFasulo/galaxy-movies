import { describe, expect, it } from 'vitest'
import { buildIcs, comingEvents, toIcsDate } from './calendar'
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
