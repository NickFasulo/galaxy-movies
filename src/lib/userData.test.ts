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
