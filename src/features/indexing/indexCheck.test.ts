import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TmdbMovie } from '../../types/tmdb'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const title: TmdbMovie = { id: 42, title: 'The Movie', poster_path: null }

const detail = (videos: unknown[] | undefined) => ({
  id: 42,
  title: 'The Movie',
  ...(videos === undefined ? {} : { videos: { results: videos } })
})

const stubFetch = (body: unknown, deadKeys: string[] = []) =>
  vi.fn((input: RequestInfo | URL) => {
    const u = String(input)
    if (u.includes('api.themoviedb.org')) return Promise.resolve(json(body))
    if (u.includes('youtube.com/oembed')) {
      const key = /watch\?v=([^&]+)/.exec(u)?.[1] || ''
      return Promise.resolve(new Response('', { status: deadKeys.includes(key) ? 404 : 200 }))
    }
    return Promise.reject(new Error(`unexpected ${u}`))
  })

import { isIndexed, pendingSignature, trailerUrlFor } from './indexCheck'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('isIndexed', () => {
  it.each([
    [{ verdict: 'PASS' }, true],
    [{ coverageState: 'Submitted and indexed' }, true],
    [{ coverageState: 'URL is unknown to Google' }, false],
    [{ verdict: 'FAIL', coverageState: 'Discovered - currently not indexed' }, false],
    [undefined, false]
  ])('maps %j to %s', (st, expected) => expect(isIndexed(st)).toBe(expected))
})

describe('pendingSignature', () => {
  it('is order-independent so an unchanged set dedupes', () => {
    const a = pendingSignature([{ url: 'b' }, { url: 'a' }])
    const b = pendingSignature([{ url: 'a' }, { url: 'b' }])
    expect(a).toBe(b)
  })

  it('changes when the pending set changes', () => {
    expect(pendingSignature([{ url: 'a' }])).not.toBe(pendingSignature([{ url: 'b' }]))
  })
})

describe('trailerUrlFor', () => {
  it('returns the /trailer URL when a playable YouTube trailer exists', async () => {
    vi.stubEnv('TMDB_API_KEY', 'k')
    vi.stubGlobal('fetch', stubFetch(detail([{ key: 'vid-a', site: 'YouTube', type: 'Trailer', official: true }])))
    await expect(trailerUrlFor(title)).resolves.toBe('https://www.galaxymovies.app/movies/42/trailer')
  })

  it('returns null for a trailer-less title — its /trailer page 404s', async () => {
    vi.stubEnv('TMDB_API_KEY', 'k')
    vi.stubGlobal('fetch', stubFetch(detail([])))
    await expect(trailerUrlFor(title)).resolves.toBeNull()
  })

  it('returns null when the only trailer is dead on YouTube', async () => {
    vi.stubEnv('TMDB_API_KEY', 'k')
    vi.stubGlobal('fetch', stubFetch(detail([{ key: 'vid-dead', site: 'YouTube', type: 'Trailer' }]), ['vid-dead']))
    await expect(trailerUrlFor(title)).resolves.toBeNull()
  })

  it('falls back to a live teaser when the trailer is dead', async () => {
    vi.stubEnv('TMDB_API_KEY', 'k')
    vi.stubGlobal(
      'fetch',
      stubFetch(
        detail([
          { key: 'vid-dead2', site: 'YouTube', type: 'Trailer' },
          { key: 'vid-live', site: 'YouTube', type: 'Teaser' }
        ]),
        ['vid-dead2']
      )
    )
    await expect(trailerUrlFor(title)).resolves.toBe('https://www.galaxymovies.app/movies/42/trailer')
  })
})
