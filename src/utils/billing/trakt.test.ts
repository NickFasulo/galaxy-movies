import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { pullFromTrakt, traktAccessToken } from './trakt'
import { TRAKT_KEY } from '../alerts/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvHset: vi.fn(async () => 1),
  kvHdel: vi.fn(async () => 1),
  getRedis: vi.fn(() => null as null | object)
}))

vi.mock('../alerts/waitlistStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../alerts/waitlistStore')>()),
  getRedis: mocks.getRedis
}))

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

const traktEntry = (kind: 'movie' | 'show', id: number, extra: Record<string, unknown> = {}) => ({
  [kind]: { title: `${kind} ${id}`, year: 2020, ids: { tmdb: id } },
  ...extra
})

// Responds per-endpoint: watchlist/movies, watchlist/shows, ratings/movies, ratings/shows
const stubSyncFetch = (overrides: Record<string, unknown> = {}) => {
  const bodies: Record<string, unknown> = {
    'sync/watchlist/movies': [traktEntry('movie', 1)],
    'sync/watchlist/shows': [traktEntry('show', 2)],
    'sync/ratings/movies': [{ ...traktEntry('movie', 3), rating: 8 }],
    'sync/ratings/shows': [{ ...traktEntry('show', 4), rating: 9 }],
    ...overrides
  }
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace('https://api.trakt.tv/', '')
    const body = bodies[path]
    return body === undefined ? new Response('not found', { status: 404 }) : okJson(body)
  }) as unknown as typeof fetch
}

const kv = () => ({ hget: mocks.kvHget, hset: mocks.kvHset, hdel: mocks.kvHdel })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getRedis.mockReturnValue(kv())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pullFromTrakt', () => {
  it('maps movies and shows into watchlist and 1–10 ratings', async () => {
    vi.stubGlobal('fetch', stubSyncFetch())
    const pulled = await pullFromTrakt('token')
    expect(pulled!.watchlist).toEqual([
      { id: 1, mediaType: 'movie', title: 'movie 1', year: '2020' },
      { id: 2, mediaType: 'tv', title: 'show 2', year: '2020' }
    ])
    expect(pulled!.ratings).toEqual([
      { id: 3, mediaType: 'movie', title: 'movie 3', year: '2020', rating: 8 },
      { id: 4, mediaType: 'tv', title: 'show 4', year: '2020', rating: 9 }
    ])
  })

  it('drops entries without a tmdb id or title and clamps odd ratings', async () => {
    vi.stubGlobal('fetch', stubSyncFetch({
      'sync/watchlist/movies': [
        traktEntry('movie', 1),
        { movie: { title: 'no tmdb', ids: {} } },
        { movie: { ids: { tmdb: 9 } } }
      ],
      'sync/watchlist/shows': [],
      'sync/ratings/movies': [{ ...traktEntry('movie', 3), rating: 12 }],
      'sync/ratings/shows': [{ ...traktEntry('show', 4), rating: 0 }]
    }))
    const pulled = await pullFromTrakt('token')
    expect(pulled!.watchlist).toHaveLength(1)
    expect(pulled!.ratings.map((r) => r.rating)).toEqual([10, 1])
  })

  it('returns null when any sync endpoint fails', async () => {
    vi.stubGlobal('fetch', stubSyncFetch({ 'sync/ratings/shows': undefined }))
    expect(await pullFromTrakt('token')).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    expect(await pullFromTrakt('token')).toBeNull()
  })
})

describe('traktAccessToken', () => {
  const tokens = { access_token: 'at', refresh_token: 'rt2' }

  it('returns not_connected with no stored refresh token', async () => {
    const auth = await traktAccessToken('u@e.com', 'https://cb')
    expect(auth).toEqual({ error: 'not_connected' })
  })

  it('returns unavailable when redis is down', async () => {
    mocks.getRedis.mockReturnValue(null)
    expect(await traktAccessToken('u@e.com', 'https://cb')).toEqual({ error: 'unavailable' })
  })

  it('persists the rotated refresh token and returns the access token', async () => {
    mocks.kvHget.mockResolvedValue({ refreshToken: 'rt1' })
    vi.stubGlobal('fetch', vi.fn(async () => okJson(tokens)))
    const auth = await traktAccessToken('u@e.com', 'https://cb')
    expect(auth).toEqual({ token: 'at' })
    expect(mocks.kvHset).toHaveBeenCalledWith(TRAKT_KEY, { 'u@e.com': { refreshToken: 'rt2' } })
  })

  it('drops the stored link when Trakt denies the refresh', async () => {
    mocks.kvHget.mockResolvedValue({ refreshToken: 'rt1' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad grant', { status: 400 })))
    const auth = await traktAccessToken('u@e.com', 'https://cb')
    expect(auth).toEqual({ error: 'not_connected' })
    expect(mocks.kvHdel).toHaveBeenCalledWith(TRAKT_KEY, 'u@e.com')
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })
})
