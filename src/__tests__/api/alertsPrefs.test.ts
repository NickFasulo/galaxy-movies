import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/alerts-prefs'
import { SYNCKEY_KEY, ALERTS_PREFS_KEY } from '../../utils/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvHset: vi.fn<(key: string, fields: Record<string, unknown>) => Promise<number>>(async () => 1),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../utils/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, hset: mocks.kvHset, eval: mocks.kvEval })
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

function makeReq({ method = 'POST', body, query }: { method?: string; body?: unknown; query?: Record<string, string> } = {}): NextApiRequest {
  const ip = nextIp()
  return {
    method,
    headers: { 'user-agent': UA, 'x-forwarded-for': ip },
    body,
    query: query || {},
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

const validBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  email: EMAIL,
  key: SYNC_KEY,
  watchlist: [{ id: 1, mediaType: 'movie', title: 'Film', poster_path: '/p.jpg', year: '2020' }],
  services: ['netflix'],
  region: 'US',
  ratings: [{ id: 2, mediaType: 'tv', title: 'Show', rating: 9, poster_path: null, year: null }],
  ...overrides
})

interface WrittenPrefs {
  watchlist: Record<string, unknown>[]
  ratings: Record<string, unknown>[]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.kvHget.mockImplementation(async (key) => key === SYNCKEY_KEY ? SYNC_KEY : null)
})

describe('POST /api/alerts-prefs', () => {
  it('stores watchlist, services, and ratings keyed by email', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody() }), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as WrittenPrefs
    expect(written.watchlist[0]).toMatchObject({ id: 1, poster_path: '/p.jpg', year: '2020' })
    expect(written.ratings[0]).toMatchObject({ id: 2, mediaType: 'tv', rating: 9 })
    expect(mocks.kvHset.mock.calls[0]![0]).toBe(ALERTS_PREFS_KEY)
  })

  it('defaults a missing ratings array to empty for old clients', async () => {
    const body = validBody()
    delete body.ratings
    const res = makeRes()
    await handler(makeReq({ body }), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as WrittenPrefs
    expect(written.ratings).toEqual([])
  })

  it.each([
    { rating: 11 },
    { rating: 0 },
    { rating: 7.5 },
    { rating: 'high' },
    { mediaType: 'podcast', rating: 5 },
    { title: 'x'.repeat(301), rating: 5 }
  ])('rejects malformed rating %j', async (bad) => {
    const res = makeRes()
    await handler(makeReq({ body: validBody({ ratings: [{ id: 1, mediaType: 'movie', title: 'T', ...bad }] }) }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('rejects a wrong sync key', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody({ key: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' }) }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })
})

describe('GET /api/alerts-prefs', () => {
  const getReq = (key = SYNC_KEY) => makeReq({ method: 'GET', query: { email: EMAIL, key } })

  it('returns the stored prefs for valid credentials', async () => {
    const prefs = { watchlist: [{ id: 1, mediaType: 'movie', title: 'F' }], services: ['netflix'], region: 'US', updatedAt: 1 }
    mocks.kvHget.mockImplementation(async (key) => key === SYNCKEY_KEY ? SYNC_KEY : key === ALERTS_PREFS_KEY ? prefs : null)
    const res = makeRes()
    await handler(getReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ prefs })
  })

  it('returns null prefs when nothing is stored yet', async () => {
    const res = makeRes()
    await handler(getReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ prefs: null })
  })

  it('rejects a wrong key without reading prefs', async () => {
    const res = makeRes()
    await handler(getReq('bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'), res)
    expect(res.statusCode).toBe(403)
  })

  it('rejects a malformed email', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { email: 'not-an-email', key: SYNC_KEY } }), res)
    expect(res.statusCode).toBe(400)
  })
})
