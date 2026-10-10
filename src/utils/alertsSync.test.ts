import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './alertsSync'
import type { UserData } from './userData'

const data = (overrides: Partial<UserData> = {}): UserData => ({
  watchlist: [],
  ratings: {},
  services: { region: 'US', providers: [] },
  ...overrides
})

describe('buildSnapshot', () => {
  it('serializes ratings from tv-namespaced and bare keys', () => {
    const snapshot = buildSnapshot(data({
      ratings: {
        5: { rating: 8, title: 'Film', mediaType: 'movie' },
        'tv:7': { rating: 3, title: 'Show', mediaType: 'tv' }
      }
    }))
    expect(snapshot.ratings).toEqual([
      { id: 5, mediaType: 'movie', title: 'Film', rating: 8, poster_path: null, year: null },
      { id: 7, mediaType: 'tv', title: 'Show', rating: 3, poster_path: null, year: null }
    ])
  })

  it('carries poster and year so a restored list renders properly', () => {
    const snapshot = buildSnapshot(data({
      watchlist: [{ id: 1, mediaType: 'movie', title: 'T', poster_path: '/x.jpg', year: '2021', added_at: 'a' }],
      ratings: { 1: { rating: 9, title: 'T', mediaType: 'movie', id: 1, poster_path: '/x.jpg', year: '2021' } }
    }))
    expect(snapshot.watchlist?.[0]).toMatchObject({ poster_path: '/x.jpg', year: '2021' })
    expect(snapshot.ratings?.[0]).toMatchObject({ poster_path: '/x.jpg', year: '2021' })
  })

  it('skips ratings entries whose id cannot be recovered', () => {
    const snapshot = buildSnapshot(data({
      ratings: { bogus: { rating: 5, title: 'Broken', mediaType: 'movie' } } as unknown as UserData['ratings']
    }))
    expect(snapshot.ratings).toEqual([])
  })
})
