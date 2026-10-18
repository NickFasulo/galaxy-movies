import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/chat-history'
import { SYNCKEY_KEY, BILLING_KEY, CHAT_HISTORY_KEY } from '../../utils/alerts/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvHset: vi.fn<(key: string, fields: Record<string, unknown>) => Promise<number>>(async () => 1),
  kvHdel: vi.fn<(key: string, field: string) => Promise<number>>(async () => 1),
  kvEval: vi.fn(async () => 1)
}))

vi.mock('../../utils/core/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, hset: mocks.kvHset, hdel: mocks.kvHdel, eval: mocks.kvEval })
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

const authed = { email: EMAIL, key: SYNC_KEY }

const plusBilling = () => (key?: string) =>
  key === SYNCKEY_KEY ? SYNC_KEY : key === BILLING_KEY ? { status: 'active' } : null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.kvHget.mockImplementation(async (key) => plusBilling()(key))
})

describe('GET /api/chat-history', () => {
  const getReq = () => makeReq({ method: 'GET', query: authed })

  it('returns stored history for a plus subscriber', async () => {
    const history = { messages: [{ role: 'user', content: 'hi' }], links: {}, updatedAt: 123 }
    mocks.kvHget.mockImplementation(async (key) => key === CHAT_HISTORY_KEY ? history : plusBilling()(key))
    const res = makeRes()
    await handler(getReq(), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ history })
  })

  it('returns null when nothing is stored', async () => {
    const res = makeRes()
    await handler(getReq(), res)
    expect(res.jsonBody).toEqual({ history: null })
  })

  it('rejects free-tier linked users', async () => {
    // billingCache is module-level per email — a distinct address keeps this
    // test uncached while EMAIL above stays 'active'.
    mocks.kvHget.mockImplementation(async (key) => key === SYNCKEY_KEY ? SYNC_KEY : null)
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { email: 'free@example.com', key: SYNC_KEY } }), res)
    expect(res.statusCode).toBe(403)
  })

  it('rejects a wrong sync key', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { ...authed, key: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' } }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.kvHget).not.toHaveBeenCalledWith(CHAT_HISTORY_KEY, expect.anything())
  })
})

describe('POST /api/chat-history', () => {
  const validBody = (overrides: Record<string, unknown> = {}) => ({
    ...authed,
    messages: [{ role: 'user', content: 'hello' }],
    links: {},
    ...overrides
  })

  it('stores sanitized history keyed by email', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody({ links: { '1': [{ match: '"Heat"', movieId: 949, mediaType: 'movie', title: 'Heat' }] } }) }), res)
    expect(res.statusCode).toBe(200)
    const stored = mocks.kvHset.mock.calls[0]![1][EMAIL] as { messages: unknown[]; updatedAt: number }
    expect(stored.messages).toHaveLength(1)
    expect(stored.updatedAt).toEqual(expect.any(Number))
  })

  it('trims to the last 30 messages rather than rejecting', async () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }))
    const res = makeRes()
    await handler(makeReq({ body: validBody({ messages }) }), res)
    expect(res.statusCode).toBe(200)
    const stored = mocks.kvHset.mock.calls[0]![1][EMAIL] as { messages: { content: string }[] }
    expect(stored.messages).toHaveLength(30)
    expect(stored.messages[0]!.content).toBe('m10')
  })

  it.each([
    { messages: 'not-an-array' },
    { messages: [{ role: 'system', content: 'x' }] },
    { messages: [{ role: 'user', content: 5 }] },
    { messages: [{ role: 'user', content: 'x'.repeat(4001) }] },
    { links: { abc: [] } },
    { links: { '1': Array.from({ length: 11 }, () => ({ match: 'm', movieId: 1, mediaType: 'movie', title: 't' })) } },
    { links: { '1': [{ match: 'm', movieId: 'x', mediaType: 'movie', title: 't' }] } },
    { links: { '1': [{ match: 'm', movieId: 1, mediaType: 'book', title: 't' }] } }
  ])('rejects malformed payload %j', async (bad) => {
    const res = makeRes()
    await handler(makeReq({ body: validBody(bad) }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('rejects an oversized body outright', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { ...authed, messages: [], pad: 'x'.repeat(31_000) } }), res)
    expect(res.statusCode).toBe(413)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('clears the stored history when the client sends an empty conversation', async () => {
    const res = makeRes()
    await handler(makeReq({ body: validBody({ messages: [] }) }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHdel).toHaveBeenCalledWith(CHAT_HISTORY_KEY, EMAIL)
    expect(mocks.kvHset).not.toHaveBeenCalledWith(CHAT_HISTORY_KEY, expect.anything())
  })

  it('rejects free-tier users before touching storage', async () => {
    mocks.kvHget.mockImplementation(async (key) => key === SYNCKEY_KEY ? SYNC_KEY : null)
    const res = makeRes()
    await handler(makeReq({ body: validBody({ email: 'free2@example.com' }) }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })
})
