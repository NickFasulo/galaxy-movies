import { describe, expect, it } from 'vitest'
import { buildTasteProfile, mergePrefsIntoData, mergeRatingMetaIntoData, type UserData } from './userData'

const data = (overrides: Partial<UserData> = {}): UserData => ({
  watchlist: [],
  ratings: {},
  services: { region: 'US', providers: [] },
  ...overrides
})

describe('buildTasteProfile', () => {
  it('keeps only high and low ratings, formatted for the chat prompt', () => {
    const profile = buildTasteProfile(data({
      ratings: {
        1: { rating: 9, title: 'Great Film', mediaType: 'movie' },
        2: { rating: 5, title: 'Meh Film', mediaType: 'movie' },
        'tv:3': { rating: 2, title: 'Bad Show', mediaType: 'tv' }
      },
      watchlist: [{ id: 4, mediaType: 'movie', title: 'Saved', poster_path: null, year: null, added_at: 'x' }],
      services: { region: 'US', providers: ['netflix'] }
    }))
    expect(profile.topRated).toEqual(['Great Film (9/10)'])
    expect(profile.disliked).toEqual(['Bad Show'])
    expect(profile.watchlist).toEqual(['Saved'])
    expect(profile.services).toEqual(['Netflix'])
  })
})

describe('mergePrefsIntoData', () => {
  it('adds server watchlist items the local data lacks', () => {
    const merged = mergePrefsIntoData(data(), {
      watchlist: [{ id: 1, mediaType: 'movie', title: 'Server Title', poster_path: '/p.jpg', year: '2020' }],
      ratings: []
    })
    expect(merged.watchlist).toHaveLength(1)
    expect(merged.watchlist[0]).toMatchObject({ id: 1, poster_path: '/p.jpg', year: '2020' })
  })

  it('does not duplicate a watchlist item present under the same mediaType:id', () => {
    const merged = mergePrefsIntoData(data({
      watchlist: [{ id: 1, mediaType: 'movie', title: 'Local', poster_path: null, year: null, added_at: 'a' }]
    }), {
      watchlist: [{ id: 1, mediaType: 'movie', title: 'Server' }]
    })
    expect(merged.watchlist).toHaveLength(1)
    expect(merged.watchlist[0].title).toBe('Local')
  })

  it('treats the same id under different media types as distinct', () => {
    const merged = mergePrefsIntoData(data({
      watchlist: [{ id: 1, mediaType: 'movie', title: 'Film', poster_path: null, year: null, added_at: 'a' }]
    }), {
      watchlist: [{ id: 1, mediaType: 'tv', title: 'Show' }]
    })
    expect(merged.watchlist).toHaveLength(2)
  })

  it('merges ratings with local winning on conflict', () => {
    const merged = mergePrefsIntoData(data({
      ratings: { 1: { rating: 8, title: 'Local Rating', mediaType: 'movie' } }
    }), {
      ratings: [
        { id: 1, mediaType: 'movie', title: 'Server Rating', rating: 3 },
        { id: 2, mediaType: 'tv', title: 'Show', rating: 9 }
      ]
    })
    expect(merged.ratings[1]?.rating).toBe(8)
    expect(merged.ratings['tv:2']?.rating).toBe(9)
  })

  it('adopts server services only when local is untouched', () => {
    const server = { region: 'GB', services: ['netflix'] }
    expect(mergePrefsIntoData(data(), server).services).toEqual({ region: 'GB', providers: ['netflix'] })
    expect(mergePrefsIntoData(data({ services: { region: 'DE', providers: [] } }), server).services)
      .toEqual({ region: 'DE', providers: [] })
    expect(mergePrefsIntoData(data({ services: { region: 'US', providers: ['hulu'] } }), server).services)
      .toEqual({ region: 'US', providers: ['hulu'] })
  })

  it('clamps out-of-range ratings and skips malformed entries', () => {
    const merged = mergePrefsIntoData(data(), {
      ratings: [
        { id: 1, title: 'Too High', rating: 42 },
        { id: 'x' as unknown as number, title: 'Bad id', rating: 5 }
      ]
    })
    expect(merged.ratings[1]?.rating).toBe(10)
    expect(Object.keys(merged.ratings)).toHaveLength(1)
  })

  it('returns local data untouched when prefs are empty', () => {
    const local = data({ watchlist: [{ id: 1, mediaType: 'movie', title: 'T', poster_path: null, year: null, added_at: 'a' }] })
    expect(mergePrefsIntoData(local, {})).toEqual(local)
  })
})

describe('mergeRatingMetaIntoData', () => {
  it('fills missing poster/year without overwriting existing fields', () => {
    const merged = mergeRatingMetaIntoData(data({
      ratings: {
        1: { rating: 8, title: 'Old', mediaType: 'movie' },
        2: { rating: 7, title: 'Has Poster', mediaType: 'movie', poster_path: '/keep.jpg', year: '1999' },
        'tv:3': { rating: 9, title: 'Show', mediaType: 'tv' }
      }
    }), [
      { id: 1, mediaType: 'movie', poster_path: '/new.jpg', year: '2001' },
      { id: 2, mediaType: 'movie', poster_path: '/replace.jpg', year: '2020' },
      { id: 3, mediaType: 'tv', poster_path: '/show.jpg', year: '2019' },
      { id: 4, mediaType: 'movie', poster_path: '/ghost.jpg' }
    ])
    expect(merged.ratings[1]).toMatchObject({ rating: 8, poster_path: '/new.jpg', year: '2001' })
    expect(merged.ratings[2]).toMatchObject({ poster_path: '/keep.jpg', year: '1999' })
    expect(merged.ratings['tv:3']?.poster_path).toBe('/show.jpg')
    expect(merged.ratings[4]).toBeUndefined()
  })

  it('treats a movie rating and a tv rating with the same id as distinct keys', () => {
    const merged = mergeRatingMetaIntoData(data({
      ratings: {
        5: { rating: 6, title: 'Film', mediaType: 'movie' },
        'tv:5': { rating: 6, title: 'Show', mediaType: 'tv' }
      }
    }), [{ id: 5, mediaType: 'tv', poster_path: '/tv.jpg' }])
    expect(merged.ratings[5]?.poster_path ?? null).toBeNull()
    expect(merged.ratings['tv:5']?.poster_path).toBe('/tv.jpg')
  })
})

import { vi, beforeEach, afterEach } from 'vitest'
import {
  ratingEntries,
  mergeWatchlistMetaIntoData,
  EMPTY_USER_DATA,
  type RatingEntry
} from './userData'

describe('ratingEntries', () => {
  it('flattens tv-namespaced and bare keys with usable ids', () => {
    const entries = ratingEntries({
      5: { rating: 8, title: 'Film', mediaType: 'movie' } as RatingEntry,
      'tv:7': { rating: 9, title: 'Show', mediaType: 'tv' } as RatingEntry,
      9: { rating: 6, title: 'No Type', mediaType: undefined as unknown as RatingEntry['mediaType'] }
    })
    expect(entries.map((e) => `${e.mediaType}:${e.id}`).sort()).toEqual(['movie:5', 'movie:9', 'tv:7'])
  })

  it('prefers the stored entry id and skips unrecoverable keys', () => {
    const entries = ratingEntries({
      5: { rating: 8, title: 'Film', mediaType: 'movie', id: 42 } as RatingEntry,
      bogus: { rating: 1, title: 'Broken', mediaType: 'movie' } as RatingEntry
    } as unknown as UserData['ratings'])
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe(42)
  })
})

describe('mergeWatchlistMetaIntoData', () => {
  it('fills missing poster/year/title without overwriting or renaming', () => {
    const merged = mergeWatchlistMetaIntoData(data({
      watchlist: [
        { id: 1, mediaType: 'movie', title: 'Old', poster_path: null, year: null, added_at: 'a' },
        { id: 2, mediaType: 'movie', title: 'Full', poster_path: '/k.jpg', year: '2000', added_at: 'b' }
      ]
    }), [
      { id: 1, mediaType: 'movie', poster_path: '/new.jpg', year: '2010', title: 'Renamed' },
      { id: 2, mediaType: 'movie', poster_path: '/x.jpg' },
      { id: 3, mediaType: 'movie', poster_path: '/ghost.jpg' }
    ])
    expect(merged.watchlist[0]).toMatchObject({ poster_path: '/new.jpg', year: '2010', title: 'Old' })
    expect(merged.watchlist[1]).toMatchObject({ poster_path: '/k.jpg', year: '2000' })
    expect(merged.watchlist).toHaveLength(2)
  })

  it('returns the same data reference when nothing needs patching', () => {
    const original = data({
      watchlist: [{ id: 1, mediaType: 'movie', title: 'T', poster_path: '/p.jpg', year: '2020', added_at: 'a' }]
    })
    expect(mergeWatchlistMetaIntoData(original, [{ id: 1, mediaType: 'movie', poster_path: '/other.jpg' }])).toBe(original)
  })
})

// Storage-backed functions — window is stubbed per test since vitest runs in node.
const makeStorage = () => {
  const store = new Map<string, string>()
  const listeners = new Set<(e: { key: string | null }) => void>()
  return {
    store,
    listeners,
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear()
    },
    addEventListener: (_type: string, fn: (e: { key: string | null }) => void) => listeners.add(fn),
    dispatchStorage(key: string | null) { listeners.forEach((fn) => fn({ key })) }
  }
}

const freshModule = async (storage = makeStorage()) => {
  vi.resetModules()
  vi.stubGlobal('window', { localStorage: storage.localStorage, addEventListener: storage.addEventListener })
  const mod = await import('./userData')
  return { mod, storage }
}

const movie = { id: 1, title: 'Film One', poster_path: '/f.jpg', release_date: '2020-05-01' }

describe('localStorage-backed user data', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())

  it('toggleWatchlist adds then removes the same title', async () => {
    const { mod, storage } = await freshModule()
    mod.toggleWatchlist(movie)
    expect(mod.isWatchlisted(1, mod.getUserData())).toBe(true)
    expect(storage.store.get('gm.userData.v1')).toBeTruthy()
    mod.toggleWatchlist(movie)
    expect(mod.isWatchlisted(1, mod.getUserData())).toBe(false)
  })

  it('keyed by mediaType — a tv title with the same id is distinct', async () => {
    const { mod } = await freshModule()
    mod.toggleWatchlist({ id: 1, name: 'Show', mediaType: 'tv', first_air_date: '2021-01-01' })
    expect(mod.isWatchlisted(1, mod.getUserData())).toBe(false)
    expect(mod.isWatchlisted(1, mod.getUserData(), 'tv')).toBe(true)
    expect(mod.getUserData().watchlist[0].year).toBe('2021')
  })

  it('setRating writes, reads, and deletes ratings including tv namespacing', async () => {
    const { mod } = await freshModule()
    mod.setRating(movie, 8)
    mod.setRating({ id: 1, name: 'Show', first_air_date: '2019-01-01' }, 9, 'tv')
    let ud = mod.getUserData()
    expect(mod.getRating(1, ud)).toBe(8)
    expect(mod.getRating(1, ud, 'tv')).toBe(9)
    expect(ud.ratings[1]).toMatchObject({ rating: 8, title: 'Film One', year: '2020', id: 1 })
    mod.setRating(movie, null)
    ud = mod.getUserData()
    expect(mod.getRating(1, ud)).toBeNull()
    expect(mod.getRating(1, ud, 'tv')).toBe(9)
  })

  it('setServices persists region + providers', async () => {
    const { mod } = await freshModule()
    mod.setServices('IN', ['netflix', 'jiohotstar'])
    expect(mod.getUserData().services).toEqual({ region: 'IN', providers: ['netflix', 'jiohotstar'] })
  })

  it('getUserData normalizes malformed stored JSON to empty data', async () => {
    const storage = makeStorage()
    storage.store.set('gm.userData.v1', '{broken json')
    const { mod } = await freshModule(storage)
    expect(mod.getUserData()).toEqual(EMPTY_USER_DATA)
  })

  it('getUserData fills missing pieces of a partial stored shape', async () => {
    const storage = makeStorage()
    storage.store.set('gm.userData.v1', JSON.stringify({ watchlist: [{ id: 1 }], services: { region: 'IN' } }))
    const { mod } = await freshModule(storage)
    const ud = mod.getUserData()
    expect(ud.watchlist).toHaveLength(1)
    expect(ud.ratings).toEqual({})
    expect(ud.services).toEqual({ region: 'IN', providers: [] })
  })

  it('subscribeUserData fires listeners on writes and on foreign-tab storage events', async () => {
    const { mod, storage } = await freshModule()
    const calls: string[] = []
    mod.subscribeUserData(() => calls.push('fired'))
    mod.toggleWatchlist(movie)
    expect(calls).toHaveLength(1)
    storage.store.set('gm.userData.v1', JSON.stringify({ ratings: { 5: { rating: 10, title: 'T', mediaType: 'movie' } } }))
    storage.dispatchStorage('gm.userData.v1')
    expect(calls).toHaveLength(2)
    expect(mod.getUserData().ratings[5]?.rating).toBe(10)
  })

  it('mergeSyncedPrefs folds server prefs into local data', async () => {
    const { mod } = await freshModule()
    mod.mergeSyncedPrefs({ watchlist: [{ id: 7, mediaType: 'tv', title: 'Server Show' }] })
    expect(mod.isWatchlisted(7, mod.getUserData(), 'tv')).toBe(true)
  })

  it('backfillRatingMeta + backfillWatchlistMeta patch stored entries', async () => {
    const { mod } = await freshModule()
    mod.setRating({ id: 2, title: 'Old Film' }, 7)
    mod.toggleWatchlist({ id: 3, title: 'Wish' })
    mod.backfillRatingMeta([{ id: 2, mediaType: 'movie', poster_path: '/r.jpg', year: '1999' }])
    mod.backfillWatchlistMeta([{ id: 3, mediaType: 'movie', poster_path: '/w.jpg' }])
    const ud = mod.getUserData()
    expect(ud.ratings[2]?.poster_path).toBe('/r.jpg')
    expect(ud.watchlist[0]?.poster_path).toBe('/w.jpg')
  })

  it('falls back to memory when localStorage writes throw', async () => {
    const storage = makeStorage()
    storage.localStorage.getItem = () => { throw new Error('denied') }
    storage.localStorage.setItem = () => { throw new Error('denied') }
    const { mod } = await freshModule(storage)
    mod.toggleWatchlist(movie)
    expect(mod.isWatchlisted(1, mod.getUserData())).toBe(true)
    // Persisted nowhere — memory fallback only.
    expect(storage.store.has('gm.userData.v1')).toBe(false)
  })
})
