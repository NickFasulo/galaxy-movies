import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/trakt/import'
import { SYNCKEY_KEY, BILLING_KEY, ALERTS_PREFS_KEY } from '../../features/alerts/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvHset: vi.fn<(key: string, fields: Record<string, unknown>) => Promise<number>>(async () => 1),
  kvHdel: vi.fn(async () => 1),
  kvEval: vi.fn(async () => 1),
  accessToken: vi.fn(async () => ({ token: 'at' }) as { token: string } | { error: string }),
  pull: vi.fn(async () => ({ watchlist: [], ratings: [] }) as unknown)
}))

vi.mock('../../lib/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, hset: mocks.kvHset, hdel: mocks.kvHdel, eval: mocks.kvEval })
}))
vi.mock('../../features/billing/trakt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/billing/trakt')>()),
  traktConfigured: () => true,
  traktAccessToken: mocks.accessToken,
  pullFromTrakt: mocks.pull
}))

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'
const SYNC_KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const EMAIL = 'user@example.com'

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
}

let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

const makeReq = (email = EMAIL): NextApiRequest => {
  const ip = nextIp()
  return {
    method: 'POST',
    headers: { 'user-agent': UA, 'x-forwarded-for': ip },
    body: { email, key: SYNC_KEY },
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

const pullItem = (id: number, mediaType: 'movie' | 'tv' = 'movie') => ({ id, mediaType, title: `T${id}`, year: '2020' })

const storedPrefs = {
  watchlist: [{ id: 1, mediaType: 'movie', title: 'Stored', poster_path: '/s.jpg', year: '2019' }],
  services: ['netflix'],
  region: 'US',
  ratings: [{ id: 2, mediaType: 'movie', title: 'Rated', rating: 8, poster_path: null, year: null }],
  updatedAt: 1
}

const plusKvs = (email: string, prefs: unknown = storedPrefs) => (key?: string, field?: string) =>
  key === SYNCKEY_KEY ? SYNC_KEY : key === BILLING_KEY ? (field === email ? { status: 'active' } : null) : key === ALERTS_PREFS_KEY ? prefs : null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.kvHget.mockImplementation(async (key, field) => plusKvs(EMAIL)(key, field))
  mocks.accessToken.mockResolvedValue({ token: 'at' })
  mocks.pull.mockResolvedValue({ watchlist: [], ratings: [] })
})

describe('POST /api/trakt/import', () => {
  it('appends only unseen ids — stored entries win every conflict', async () => {
    mocks.pull.mockResolvedValue({
      watchlist: [pullItem(1), pullItem(5), pullItem(6, 'tv')],
      ratings: [{ ...pullItem(2), rating: 4 }, { ...pullItem(7), rating: 9 }]
    })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ ok: true, imported: { watchlist: 2, ratings: 1 } })

    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as typeof storedPrefs
    // The stored #1 keeps its poster/year — the pulled duplicate is dropped.
    expect(written.watchlist[0]).toMatchObject({ title: 'Stored', poster_path: '/s.jpg' })
    expect(written.watchlist.map((w) => w.id)).toEqual([1, 5, 6])
    expect(written.ratings[0]).toMatchObject({ id: 2, rating: 8 })
    expect(written.ratings.map((r) => r.id)).toEqual([2, 7])
    expect(written.services).toEqual(['netflix'])
  })

  it('bootstraps prefs when the subscriber has none stored', async () => {
    mocks.kvHget.mockImplementation(async (key, field) => plusKvs(EMAIL, null)(key, field))
    mocks.pull.mockResolvedValue({ watchlist: [pullItem(9)], ratings: [] })
    const res = makeRes()
    await handler(makeReq(), res)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as typeof storedPrefs
    expect(written.watchlist.map((w) => w.id)).toEqual([9])
    expect(written.services).toEqual([])
    expect(written.region).toBe('US')
  })

  it('writes nothing when everything is already stored', async () => {
    mocks.pull.mockResolvedValue({ watchlist: [pullItem(1)], ratings: [{ ...pullItem(2), rating: 3 }] })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.jsonBody).toEqual({ ok: true, imported: { watchlist: 0, ratings: 0 } })
    expect(mocks.kvHset).not.toHaveBeenCalledWith(ALERTS_PREFS_KEY, expect.anything())
  })

  it('caps merged watchlist entries at the plus limit', async () => {
    const full = {
      ...storedPrefs,
      watchlist: Array.from({ length: 999 }, (_, i) => ({ id: 10_000 + i, mediaType: 'movie' as const, title: `W${i}`, poster_path: null, year: null }))
    }
    mocks.kvHget.mockImplementation(async (key, field) => plusKvs(EMAIL, full)(key, field))
    mocks.pull.mockResolvedValue({ watchlist: [pullItem(1), pullItem(2), pullItem(3)], ratings: [] })
    const res = makeRes()
    await handler(makeReq(), res)
    expect((res.jsonBody as { imported: { watchlist: number } }).imported.watchlist).toBe(1)
    expect((mocks.kvHset.mock.calls[0]![1][EMAIL] as typeof storedPrefs).watchlist).toHaveLength(1000)
  })

  it('passes through a dead trakt connection as 409', async () => {
    mocks.accessToken.mockResolvedValue({ error: 'not_connected' })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(409)
    expect((res.jsonBody as { code: string }).code).toBe('not_connected')
    expect(mocks.pull).not.toHaveBeenCalled()
  })

  it('returns 502 when the pull fails upstream', async () => {
    mocks.pull.mockResolvedValue(null)
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(502)
  })

  it('rejects free-tier subscribers', async () => {
    // Distinct email — the module billing cache holds EMAIL as active.
    const res = makeRes()
    await handler(makeReq('free@example.com'), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.pull).not.toHaveBeenCalled()
  })
})
