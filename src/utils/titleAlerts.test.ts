import { describe, expect, it } from 'vitest'
import { matchWatchEntry, mergeWatchTitles, parseWatchEntry, MAX_WATCH_TITLES, type WatchEntry } from './titleAlerts'
import type { ProviderChanges } from './streamingChanges'

const changes = (overrides: Partial<ProviderChanges>): ProviderChanges => ({
  source: 'Netflix',
  updatedAt: 0,
  added: [],
  left: [],
  coming: [],
  ...overrides
})

const entry = (titles: WatchEntry['titles']): WatchEntry => ({ unsub: 'u1', titles })

describe('parseWatchEntry', () => {
  it('accepts a stored entry and drops malformed titles', () => {
    expect(parseWatchEntry({ unsub: 'u', titles: [{ tmdbId: 5, tmdbType: 'movie', title: 'X' }, { title: 'bad' }] }))
      .toEqual({ unsub: 'u', titles: [{ tmdbId: 5, tmdbType: 'movie', title: 'X' }] })
  })
  it('rejects non-entry shapes', () => {
    expect(parseWatchEntry(null)).toBeNull()
    expect(parseWatchEntry({ titles: [] })).toBeNull()
  })
})

describe('mergeWatchTitles', () => {
  it('dedupes by type+id and caps the list', () => {
    const titles = Array.from({ length: MAX_WATCH_TITLES }, (_, i) => ({ tmdbId: i, tmdbType: 'movie' as const, title: `T${i}` }))
    const merged = mergeWatchTitles(titles, { tmdbId: 5, tmdbType: 'movie', title: 'T5 new' })
    expect(merged).toHaveLength(MAX_WATCH_TITLES)
    expect(merged[0].title).toBe('T5 new')
    expect(merged.filter((t) => t.tmdbId === 5)).toHaveLength(1)
  })
})

describe('matchWatchEntry', () => {
  const usChanges = {
    netflix: changes({
      added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }],
      coming: [{ tmdbId: 20, tmdbType: 'tv' as const, title: 'Show', date: '2026-11-01', season: 2 }],
      left: [{ tmdbId: 30, tmdbType: 'movie' as const, title: 'Gone', year: 1999 }]
    }),
    hulu: changes({ source: 'Hulu', added: [{ tmdbId: 10, tmdbType: 'movie' as const, title: 'Dune', year: 2024 }] })
  }

  it('matches tracked titles across every provider and kind', () => {
    const { matches, arrived } = matchWatchEntry(
      entry([
        { tmdbId: 10, tmdbType: 'movie', title: 'Dune' },
        { tmdbId: 20, tmdbType: 'tv', title: 'Show' },
        { tmdbId: 30, tmdbType: 'movie', title: 'Gone' },
        { tmdbId: 99, tmdbType: 'movie', title: 'Elsewhere' }
      ]),
      usChanges,
      new Set()
    )
    expect(matches.map((m) => `${m.kind}:${m.tmdbId}@${m.provider}`)).toEqual([
      'added:10@Netflix',
      'coming:20@Netflix',
      'leaving:30@Netflix',
      'added:10@Hulu'
    ])
    expect([...arrived]).toEqual(['movie:10'])
  })

  it('skips already-notified events', () => {
    const { matches } = matchWatchEntry(
      entry([{ tmdbId: 10, tmdbType: 'movie', title: 'Dune' }]),
      usChanges,
      new Set(['watch:added:movie:10@netflix', 'watch:added:movie:10@hulu'])
    )
    expect(matches).toHaveLength(0)
  })

  it('does not mark coming/leaving as arrival', () => {
    const { arrived } = matchWatchEntry(
      entry([
        { tmdbId: 20, tmdbType: 'tv', title: 'Show' },
        { tmdbId: 30, tmdbType: 'movie', title: 'Gone' }
      ]),
      usChanges,
      new Set()
    )
    expect(arrived.size).toBe(0)
  })
})
