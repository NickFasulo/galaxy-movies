import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/plus-recs'
import { SYNCKEY_KEY, BILLING_KEY, ALERTS_PREFS_KEY } from '../../features/alerts/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvMget: vi.fn<(...keys: string[]) => Promise<(number[] | null)[]>>(async () => []),
  kvSet: vi.fn(async () => 'OK'),
  kvEval: vi.fn(async () => 1),
  recMovies: vi.fn(async (): Promise<{ results: { id: number }[] }> => ({ results: [] })),
  recTv: vi.fn(async (): Promise<{ results: { id: number }[] }> => ({ results: [] }))
}))

vi.mock('../../lib/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, mget: mocks.kvMget, set: mocks.kvSet, eval: mocks.kvEval })
}))
vi.mock('../../features/catalog/tmdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/catalog/tmdb')>()),
  fetchRecommendedMovies: mocks.recMovies,
  fetchRecommendedTv: mocks.recTv
}))

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'
const SYNC_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
}

// billingCache and recsLru are module-level and keyed by email — each test
// gets its own address so nothing carries over.
let seq = 0
const nextIp = () => `203.0.113.${(seq++ % 250) + 1}`
const nextEmail = () => `user${seq}@example.com`

const makeReq = (email: string): NextApiRequest => {
  const ip = nextIp()
  return {
    method: 'GET',
    headers: { 'user-agent': UA, 'x-forwarded-for': ip },
    query: { email, key: SYNC_KEY },
    socket: { remoteAddress: ip }
  } as unknown as NextApiRequest
}

function makeRes(): MockRes {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown,
    setHeader() {},
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.jsonBody = payload
      return res
    },
    end() { return res }
  }
  return res as unknown as MockRes
}

const basePrefs = {
  watchlist: [{ id: 1, mediaType: 'movie' as const, title: 'Already Saved' }],
  services: ['netflix'],
  region: 'US',
  ratings: [
    { id: 100, mediaType: 'movie' as const, title: 'A', rating: 9 },
    { id: 200, mediaType: 'tv' as const, title: 'B', rating: 8 },
    { id: 300, mediaType: 'movie' as const, title: 'C', rating: 4 }
  ],
  updatedAt: 1
}

const kvFor = (prefs: unknown, plus = true) => async (key?: string) =>
  key === SYNCKEY_KEY ? SYNC_KEY : key === BILLING_KEY ? (plus ? { status: 'active' } : null) : key === ALERTS_PREFS_KEY ? prefs : null

const mgetFor = (recs: Record<string, number[] | null>) => async (...keys: string[]) => keys.map((k) => recs[k] ?? null)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/plus-recs', () => {
  it('rejects free-tier and bad credentials', async () => {
    mocks.kvHget.mockImplementation(kvFor(basePrefs, false))
    const res = makeRes()
    await handler(makeReq(nextEmail()), res)
    expect(res.statusCode).toBe(403)

    mocks.kvHget.mockImplementation(async () => null)
    const res2 = makeRes()
    await handler(makeReq(nextEmail()), res2)
    expect(res2.statusCode).toBe(403)
  })

  it('returns empty items when the subscriber has no strong ratings', async () => {
    mocks.kvHget.mockImplementation(kvFor({ ...basePrefs, ratings: [{ id: 300, mediaType: 'movie', title: 'C', rating: 4 }] }))
    mocks.kvMget.mockImplementation(mgetFor({}))
    const res = makeRes()
    await handler(makeReq(nextEmail()), res)
    expect(res.jsonBody).toEqual({ items: [] })
  })

  it('round-robins rec lists across sources, dropping watchlisted and rated ids', async () => {
    mocks.kvHget.mockImplementation(kvFor(basePrefs))
    mocks.kvMget.mockImplementation(mgetFor({
      'recs:v1:movie:100': [1, 2, 3, 4],   // 1 is watchlisted
      'recs:v1:tv:200': [5, 6, 7, 200]     // 200 is rated
    }))
    const res = makeRes()
    await handler(makeReq(nextEmail()), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({
      items: [
        { id: 5, mediaType: 'tv' },
        { id: 2, mediaType: 'movie' },
        { id: 6, mediaType: 'tv' },
        { id: 3, mediaType: 'movie' },
        { id: 7, mediaType: 'tv' },
        { id: 4, mediaType: 'movie' }
      ]
    })
    expect(mocks.recMovies).not.toHaveBeenCalled()
    expect(mocks.recTv).not.toHaveBeenCalled()
  })

  it('backfills cold rec keys from TMDB and stores them under the 30d cache key', async () => {
    mocks.kvHget.mockImplementation(kvFor({
      ...basePrefs,
      watchlist: [],
      ratings: [{ id: 100, mediaType: 'movie', title: 'A', rating: 9 }]
    }))
    mocks.kvMget.mockImplementation(mgetFor({}))
    mocks.recMovies.mockResolvedValue({ results: [{ id: 8 }, { id: 9 }] })
    const res = makeRes()
    await handler(makeReq(nextEmail()), res)
    expect(res.jsonBody).toEqual({ items: [{ id: 8, mediaType: 'movie' }, { id: 9, mediaType: 'movie' }] })
    expect(mocks.kvSet).toHaveBeenCalledWith('recs:v1:movie:100', [8, 9], { ex: 60 * 60 * 24 * 30 })
  })

  it('serves repeat requests from the per-email LRU without re-reading redis', async () => {
    const email = nextEmail()
    mocks.kvHget.mockImplementation(kvFor({
      watchlist: [], services: [], region: 'US',
      ratings: [{ id: 101, mediaType: 'movie', title: 'D', rating: 9 }],
      updatedAt: 1
    }))
    mocks.kvMget.mockImplementation(mgetFor({ 'recs:v1:movie:101': [11, 12] }))

    const first = makeRes()
    await handler(makeReq(email), first)
    expect((first.jsonBody as { items: unknown[] }).items).toHaveLength(2)
    // The synckey credential read happens on every request — the LRU only
    // needs to spare the prefs + rec-index reads.
    const prefsReads = mocks.kvHget.mock.calls.filter((c) => c[0] === ALERTS_PREFS_KEY).length

    const second = makeRes()
    await handler(makeReq(email), second)
    expect(second.jsonBody).toEqual(first.jsonBody)
    expect(mocks.kvHget.mock.calls.filter((c) => c[0] === ALERTS_PREFS_KEY)).toHaveLength(prefsReads)
    expect(mocks.kvMget).toHaveBeenCalledTimes(1)
  })
})
