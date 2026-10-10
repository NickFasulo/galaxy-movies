import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

const kv = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn<(key: string, value: unknown, opts?: unknown) => Promise<string>>(),
  mget: vi.fn(async (): Promise<unknown> => null),
  hgetall: vi.fn(async (): Promise<unknown> => null),
  incrby: vi.fn(async () => 1),
  eval: vi.fn(async () => 1)
}))
const getRedis = vi.hoisted(() => vi.fn((): unknown => null))

vi.mock('../../utils/redis', () => ({ getRedis }))

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>
let handler: Handler

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'

function makeReq(over: Partial<NextApiRequest> = {}): NextApiRequest {
  return {
    method: 'POST',
    headers: { 'user-agent': UA, 'x-forwarded-for': '203.0.113.50' },
    query: {},
    body: {},
    ...over
  } as NextApiRequest
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string | string[]>,
    jsonBody: undefined as unknown,
    setHeader(name: string, value: string | string[]) {
      res.headers[name] = value
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.jsonBody = payload
      return res
    },
    end() {
      return res
    }
  }
  return res as unknown as NextApiResponse & { statusCode: number; headers: Record<string, string | string[]>; jsonBody: unknown }
}

const authed = (query: Record<string, string> = {}) =>
  makeReq({ method: 'GET', headers: { 'user-agent': UA, authorization: 'Bearer test-secret' }, query })

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('CRON_SECRET', 'test-secret')
  getRedis.mockReturnValue(null)
  handler = (await import('./chatAnalytics')).default
})

describe('POST actions', () => {
  it('rejects bots', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: { 'user-agent': 'curl/8.0' } }), res)
    expect(res.statusCode).toBe(403)
  })

  it('tracks a session and returns its id', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { action: 'track_session', data: { messageCount: 3, duration: 60_000 } } }), res)
    expect(res.statusCode).toBe(200)
    expect((res.jsonBody as { sessionId: string }).sessionId).toMatch(/^session_\d+_[a-z0-9]+$/)
  })

  it('clamps session fields to sane bounds before storing', async () => {
    getRedis.mockReturnValue(kv)
    const res = makeRes()
    await handler(makeReq({ body: { action: 'track_session', data: { messageCount: 99_999, duration: 999_999_999 } } }), res)
    const stored = kv.set.mock.calls[0][1] as { messageCount: number; duration: number }
    expect(stored.messageCount).toBe(200)
    expect(stored.duration).toBe(86_400_000)
  })

  it('stores sessions in Redis under chat_session:*', async () => {
    getRedis.mockReturnValue(kv)
    await handler(makeReq({ body: { action: 'track_session', data: { messageCount: 2 } } }), makeRes())
    const [key, , opts] = kv.set.mock.calls[0]
    expect(key).toMatch(/^chat_session:session_/)
    expect(opts).toMatchObject({ ex: 60 * 60 * 24 * 30 })
  })

  it('records feedback with bounded rating and clean sessionId', async () => {
    getRedis.mockReturnValue(kv)
    const res = makeRes()
    await handler(
      makeReq({ body: { action: 'record_feedback', data: { rating: 99, comment: 'great', sessionId: 'evil id!; DROP', helpful: 'yes' } } }),
      res
    )
    expect(res.statusCode).toBe(200)
    const [key, rawFeedback] = kv.set.mock.calls[0]
    const feedback = rawFeedback as { rating: number; sessionId: string; helpful: boolean }
    expect(key).toMatch(/^chat_feedback:feedback_/)
    expect(feedback.rating).toBe(5)
    expect(feedback.sessionId).toBe('')
    expect(feedback.helpful).toBe(false)
  })

  it.each([['missing action', {}], ['unknown action', { action: 'delete_all' }]])('returns 400 for %s', async (_label, body) => {
    const res = makeRes()
    await handler(makeReq({ body }), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 429 after 30 posts/hour from one IP', async () => {
    for (let i = 0; i < 30; i++) {
      const res = makeRes()
      await handler(makeReq({ body: { action: 'track_session', data: {} } }), res)
      expect(res.statusCode).toBe(200)
    }
    const res = makeRes()
    await handler(makeReq({ body: { action: 'track_session', data: {} } }), res)
    expect(res.statusCode).toBe(429)
  })
})

describe('GET stats/costs', () => {
  it('requires cron authorization', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', query: { action: 'stats' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('rejects a wrong bearer token', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET', headers: { 'user-agent': UA, authorization: 'Bearer nope' }, query: { action: 'stats' } }), res)
    expect(res.statusCode).toBe(401)
  })

  it('returns local usage stats without Redis', async () => {
    await handler(makeReq({ body: { action: 'track_session', data: { messageCount: 4 } } }), makeRes())
    const res = makeRes()
    await handler(authed({ action: 'stats' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toMatchObject({ totalSessions: 1, totalMessages: 4 })
  })

  it('reads counters from Redis when available', async () => {
    getRedis.mockReturnValue(kv)
    kv.mget.mockResolvedValue([10, 250, 42, 9])
    const res = makeRes()
    await handler(authed({ action: 'stats' }), res)
    expect(res.jsonBody).toMatchObject({ totalSessions: 10, totalMessages: 250, avgRating: '4.7' })
  })

  it('builds a cost breakdown from real ai_usage fields', async () => {
    getRedis.mockReturnValue(kv)
    kv.hgetall.mockResolvedValue({
      'gpt-6-luna.chat.input': 2000,
      'gpt-6-luna.chat.cached': 1000,
      'gpt-6-luna.chat.output': 400,
      'gpt-6-luna.chat.requests': 5,
      'gpt-6-luna.chat.latency_ms': 2500,
      'gpt-6-luna.review.input': 500
    })
    const res = makeRes()
    await handler(authed({ action: 'costs' }), res)
    const body = res.jsonBody as { source: string; breakdown: Record<string, string> }
    expect(body.source).toBe('actual_usage')
    expect(body.breakdown['gpt-6-luna/chat']).toContain('5 reqs')
    expect(body.breakdown['gpt-6-luna/chat']).toContain('50% cached')
    expect(body.breakdown['gpt-6-luna/chat']).toContain('500ms avg')
    expect(body.breakdown['gpt-6-luna/review']).toBeDefined()
  })

  it('falls back to the message-count estimate without usage data', async () => {
    const res = makeRes()
    await handler(authed({ action: 'costs' }), res)
    expect(res.jsonBody).toMatchObject({ model: 'gpt-6-luna', source: 'estimated' })
  })

  it('returns 400 for an unknown GET action', async () => {
    const res = makeRes()
    await handler(authed({ action: 'whatever' }), res)
    expect(res.statusCode).toBe(400)
  })
})
