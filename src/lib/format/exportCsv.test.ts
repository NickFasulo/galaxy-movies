import { describe, expect, it } from 'vitest'
import { letterboxdCsvs } from './exportCsv'
import type { SyncedPrefs } from '../userData'

const prefs = (overrides: Partial<SyncedPrefs> = {}): SyncedPrefs => ({
  watchlist: [],
  ratings: [],
  ...overrides
})

describe('letterboxdCsvs', () => {
  it('emits tmdbID/Title/Year/Rating10 headers Letterboxd imports', () => {
    const { ratings, watchlist } = letterboxdCsvs(prefs({
      ratings: [{ id: 278, mediaType: 'movie', title: 'The Shawshank Redemption', rating: 9, year: '1994' }],
      watchlist: [{ id: 680, mediaType: 'movie', title: 'Pulp Fiction', year: '1994' }]
    }))
    expect(ratings.split('\r\n')[0]).toBe('tmdbID,Title,Year,Rating10')
    expect(ratings).toContain('278,The Shawshank Redemption,1994,9')
    expect(watchlist.split('\r\n')[0]).toBe('tmdbID,Title,Year')
    expect(watchlist).toContain('680,Pulp Fiction,1994')
  })

  it('excludes tv entries — Letterboxd is film-only', () => {
    const { ratings, watchlist } = letterboxdCsvs(prefs({
      ratings: [
        { id: 1, mediaType: 'tv', title: 'Show', rating: 8 },
        { id: 2, mediaType: 'movie', title: 'Film', rating: 7 }
      ],
      watchlist: [{ id: 3, mediaType: 'tv', title: 'Show 2' }]
    }))
    expect(ratings).not.toContain('Show')
    expect(ratings).toContain('2,Film,,7')
    expect(watchlist.split('\r\n').filter(Boolean)).toHaveLength(1)
  })

  it('escapes commas, quotes, and newlines per RFC 4180', () => {
    const { watchlist } = letterboxdCsvs(prefs({
      watchlist: [
        { id: 1, mediaType: 'movie', title: 'Monsters, Inc.', year: '2001' },
        { id: 2, mediaType: 'movie', title: 'He said "hi"\nnext' }
      ]
    }))
    expect(watchlist).toContain('"Monsters, Inc."')
    expect(watchlist).toContain('"He said ""hi""\nnext"')
  })

  it('treats a missing mediaType as movie', () => {
    const { ratings } = letterboxdCsvs(prefs({
      ratings: [{ id: 9, title: 'Old Entry', rating: 5 }]
    }))
    expect(ratings).toContain('9,Old Entry,,5')
  })
})
