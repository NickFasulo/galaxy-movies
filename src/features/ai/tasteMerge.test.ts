import { describe, expect, it } from 'vitest'
import { localTasteSide, mergeTaste, movieNightPrompt, parseShareInput, type TasteSide } from './tasteMerge'
import type { UserData } from '../../lib/userData'

describe('parseShareInput', () => {
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  it('accepts a bare shareId, a /list path, and a full URL', () => {
    expect(parseShareInput(id)).toBe(id)
    expect(parseShareInput(`/list/${id}`)).toBe(id)
    expect(parseShareInput(`https://www.galaxymovies.app/list/${id}?x=1`)).toBe(id)
    expect(parseShareInput(`  ${id}  `)).toBe(id)
  })
  it('rejects non-uuid input', () => {
    expect(parseShareInput('')).toBeNull()
    expect(parseShareInput('hello')).toBeNull()
    expect(parseShareInput('/list/not-a-uuid')).toBeNull()
  })
})

const side = (overrides: Partial<TasteSide> = {}): TasteSide => ({
  topRated: [],
  disliked: [],
  watchlist: [],
  serviceKeys: [],
  ...overrides
})

describe('mergeTaste', () => {
  it('intersects services when both sides have them', () => {
    const merged = mergeTaste(
      side({ serviceKeys: ['netflix', 'hulu'] }),
      side({ serviceKeys: ['netflix', 'max'] })
    )
    expect(merged.serviceKeys).toEqual(['netflix'])
    expect(merged.services).toEqual(['Netflix'])
  })

  it('falls back to whichever side has services when one is empty', () => {
    expect(mergeTaste(side({ serviceKeys: ['hulu'] }), side()).serviceKeys).toEqual(['hulu'])
    expect(mergeTaste(side(), side({ serviceKeys: ['max'] })).serviceKeys).toEqual(['max'])
  })

  it('falls back to the union when the intersection is empty', () => {
    const merged = mergeTaste(
      side({ serviceKeys: ['netflix'] }),
      side({ serviceKeys: ['max'] })
    )
    expect(merged.serviceKeys.sort()).toEqual(['max', 'netflix'])
  })

  it('dedupes profile lists and finds titles both people loved', () => {
    const merged = mergeTaste(
      side({ topRated: ['Dune (9/10)', 'Alien (8/10)'], disliked: ['Cats'], watchlist: ['Wicked'] }),
      side({ topRated: ['Dune (9/10)', 'Arrival (8/10)'], disliked: ['Cats', 'Morbius'], watchlist: ['Wicked', 'Nope'] })
    )
    expect(merged.sharedLoved).toEqual(['Dune (9/10)'])
    expect(merged.topRated).toEqual(['Dune (9/10)', 'Alien (8/10)', 'Arrival (8/10)'])
    expect(merged.disliked).toEqual(['Cats', 'Morbius'])
    expect(merged.watchlist).toEqual(['Wicked', 'Nope'])
  })
})

describe('movieNightPrompt', () => {
  it('names shared favorites and stays short', () => {
    const merged = mergeTaste(
      side({ topRated: ['Dune (9/10)'], serviceKeys: ['netflix'] }),
      side({ topRated: ['Dune (8/10)'], serviceKeys: ['netflix'] })
    )
    const prompt = movieNightPrompt(merged)
    expect(prompt.length).toBeLessThan(500)
    expect(prompt).toContain('Dune')
    expect(prompt).not.toContain('/10')
  })

  it('omits the bridge line when nothing overlaps', () => {
    const merged = mergeTaste(side({ topRated: ['A (9/10)'] }), side({ topRated: ['B (8/10)'] }))
    expect(movieNightPrompt(merged)).not.toContain('both loved')
  })
})

describe('localTasteSide', () => {
  it('builds a side from device userData', () => {
    const data = {
      watchlist: [{ id: 1, mediaType: 'movie' as const, title: 'Saved' }],
      ratings: {
        5: { id: 5, mediaType: 'movie' as const, title: 'Loved', rating: 9, poster_path: null, year: null },
        'tv:6': { id: 6, mediaType: 'tv' as const, title: 'Hated', rating: 2, poster_path: null, year: null }
      },
      services: { region: 'US', providers: ['netflix'] }
    } as unknown as UserData
    const s = localTasteSide(data)
    expect(s.topRated).toEqual(['Loved (9/10)'])
    expect(s.disliked).toEqual(['Hated'])
    expect(s.watchlist).toEqual(['Saved'])
    expect(s.serviceKeys).toEqual(['netflix'])
  })
})
