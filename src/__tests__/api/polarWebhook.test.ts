import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler, { verifySignature } from '../../pages/api/webhooks/polar'
import { BILLING_KEY } from '../../utils/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHset: vi.fn<(key: string, fields: Record<string, unknown>) => Promise<number>>(async () => 1)
}))

vi.mock('../../utils/redis', () => ({
  getRedis: () => ({ hset: mocks.kvHset })
}))

const SECRET = 'test_webhook_secret'
const EMAIL = 'plus@example.com'

function sign(body: string, id: string, timestamp: string, secret = SECRET): string {
  const expected = createHmac('sha256', Buffer.from(secret, 'utf8')).update(`${id}.${timestamp}.${body}`).digest('base64')
  return `v1,${expected}`
}

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
}

function makeReq(body: string, headers: Record<string, string>): NextApiRequest {
  return {
    method: 'POST',
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body)
    }
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

function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'subscription.updated',
    data: {
      id: 'sub_123',
      status: 'active',
      customer_id: 'cust_1',
      customer: { email: EMAIL },
      current_period_end: '2027-01-01T00:00:00.000Z',
      ...overrides
    }
  })
}

function headersFor(body: string, secret = SECRET) {
  const id = 'msg_1'
  const timestamp = String(Math.floor(Date.now() / 1000))
  return {
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': sign(body, id, timestamp, secret)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.POLAR_WEBHOOK_SECRET = SECRET
})

afterEach(() => {
  delete process.env.POLAR_WEBHOOK_SECRET
})

describe('verifySignature', () => {
  const body = '{"type":"x"}'
  const id = 'msg_x'
  const ts = String(Math.floor(Date.now() / 1000))

  it('accepts a signature over the literal secret bytes', () => {
    expect(verifySignature(body, id, ts, sign(body, id, ts), SECRET)).toBe(true)
  })

  it('accepts any v1 signature in a space-separated list', () => {
    const good = sign(body, id, ts).slice(3)
    expect(verifySignature(body, id, ts, `v1,badsig v1,${good}`, SECRET)).toBe(true)
  })

  it('rejects a wrong signature, missing headers, and stale timestamps', () => {
    expect(verifySignature(body, id, ts, 'v1,badsig', SECRET)).toBe(false)
    expect(verifySignature(body, '', ts, sign(body, id, ts), SECRET)).toBe(false)
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    expect(verifySignature(body, id, stale, sign(body, id, stale), SECRET)).toBe(false)
  })
})

describe('POST /api/webhooks/polar', () => {
  it('writes entitlement state for subscription events', async () => {
    const body = subscriptionEvent()
    const res = makeRes()
    await handler(makeReq(body, headersFor(body)), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHset).toHaveBeenCalledWith(BILLING_KEY, {
      [EMAIL]: expect.objectContaining({
        status: 'active',
        subscriptionId: 'sub_123',
        customerId: 'cust_1',
        currentPeriodEnd: Date.parse('2027-01-01T00:00:00.000Z')
      })
    })
  })

  it('keys the record to the stamped metadata email, not the payment email', async () => {
    const body = subscriptionEvent({ customer: { email: 'payer@example.com' }, metadata: { email: 'sync@example.com' } })
    const res = makeRes()
    await handler(makeReq(body, headersFor(body)), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHset).toHaveBeenCalledWith(BILLING_KEY, {
      'sync@example.com': expect.objectContaining({ status: 'active' })
    })
  })

  it('rejects an invalid signature without writing', async () => {
    const body = subscriptionEvent()
    const res = makeRes()
    await handler(makeReq(body, { ...headersFor(body), 'webhook-signature': 'v1,forged' }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('maps non-active statuses to inactive', async () => {
    const body = subscriptionEvent({ status: 'unpaid' })
    const res = makeRes()
    await handler(makeReq(body, headersFor(body)), res)
    expect(res.statusCode).toBe(200)
    const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as { status: string; rawStatus: string }
    expect(written.status).toBe('inactive')
    expect(written.rawStatus).toBe('unpaid')
  })

  it('stores lifecycle statuses verbatim so isPlusActive can interpret them', async () => {
    for (const status of ['canceled', 'past_due', 'active']) {
      mocks.kvHset.mockClear()
      const body = subscriptionEvent({ status })
      const res = makeRes()
      await handler(makeReq(body, headersFor(body)), res)
      expect(res.statusCode).toBe(200)
      const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as { status: string }
      expect(written.status).toBe(status)
    }
  })

  it('skips the write when no email can be resolved', async () => {
    const body = subscriptionEvent({ customer: {}, customer_email: undefined, metadata: undefined })
    const res = makeRes()
    await handler(makeReq(body, headersFor(body)), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('503s when the webhook secret is not configured', async () => {
    delete process.env.POLAR_WEBHOOK_SECRET
    const body = subscriptionEvent()
    const res = makeRes()
    await handler(makeReq(body, headersFor(body)), res)
    expect(res.statusCode).toBe(503)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })

  it('ignores non-subscription events', async () => {
    const body = JSON.stringify({ type: 'order.paid', data: {} })
    const res = makeRes()
    await handler(makeReq(body, headersFor(body)), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHset).not.toHaveBeenCalled()
  })
})

// The record the webhook writes must satisfy the entitlement reader — this is
// the contract that decides whether a paying customer actually gets Plus.
describe('webhook → isPlusActive chain', () => {
  it('grants access on active, past_due, and canceled-until-period-end; revokes it on terminal states', async () => {
    const { isPlusActive } = await import('../../utils/billing')
    const futureEnd = new Date(Date.now() + 30 * 86400_000).toISOString()

    const cases: Array<{ status: string; periodEnd?: string; entitled: boolean }> = [
      { status: 'active', periodEnd: futureEnd, entitled: true },
      { status: 'trialing', periodEnd: futureEnd, entitled: true },
      { status: 'past_due', periodEnd: futureEnd, entitled: true },
      { status: 'canceled', periodEnd: futureEnd, entitled: true },
      { status: 'canceled', periodEnd: '2020-01-01T00:00:00.000Z', entitled: false },
      { status: 'revoked', periodEnd: futureEnd, entitled: false },
      { status: 'unpaid', periodEnd: futureEnd, entitled: false }
    ]

    for (const c of cases) {
      mocks.kvHset.mockClear()
      const body = subscriptionEvent({ status: c.status, current_period_end: c.periodEnd })
      const res = makeRes()
      await handler(makeReq(body, headersFor(body)), res)
      const written = mocks.kvHset.mock.calls[0]![1][EMAIL] as Parameters<typeof isPlusActive>[0]
      expect({ status: c.status, entitled: isPlusActive(written) }).toEqual({ status: c.status, entitled: c.entitled })
    }
  })
})
