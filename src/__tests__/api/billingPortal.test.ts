import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/billing/portal'
import { BILLING_KEY, SYNCKEY_KEY } from '../../utils/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  fetch: vi.fn<(input?: unknown, init?: RequestInit) => Promise<Response>>(
    async () => ({ ok: true, json: async () => ({ customer_portal_url: 'https://portal.polar.test/s' }) } as Response)
  )
}))

vi.mock('../../utils/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget })
}))
vi.stubGlobal('fetch', mocks.fetch)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'
const KEY = 'abcd1234-abcd-1234-abcd-1234567890ab'

function makeReq(email: string): NextApiRequest {
  return {
    method: 'GET',
    headers: { 'user-agent': UA, 'x-forwarded-for': '203.0.113.9' },
    query: { email, key: KEY },
    socket: { remoteAddress: '203.0.113.9' }
  } as unknown as NextApiRequest
}

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
  redirectTo?: { code: number; url: string }
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
    redirect(code: number, url: string) {
      res.redirectTo = { code, url }
      return res
    },
    end() { return res }
  } as unknown as MockRes
  return res
}

const linkAndBill = (email: string, record: unknown) => async (key?: string, field?: string) => {
  if (key === SYNCKEY_KEY && field === email) return KEY
  if (key === BILLING_KEY && field === email) return record
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.POLAR_ACCESS_TOKEN = 'tok'
})

afterEach(() => {
  delete process.env.POLAR_ACCESS_TOKEN
})

// Emails differ per test: getBillingRecord caches by email for 60s.
describe('GET /api/billing/portal', () => {
  it('redirects to /plus for unlinked credentials', async () => {
    mocks.kvHget.mockResolvedValue(null)
    const res = makeRes()
    await handler(makeReq('nobody@example.com'), res)
    expect(res.redirectTo).toEqual({ code: 302, url: '/plus' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('redirects to /plus when the billing record has no customer id', async () => {
    const email = 'nocust@example.com'
    mocks.kvHget.mockImplementation(linkAndBill(email, { status: 'active' }))
    const res = makeRes()
    await handler(makeReq(email), res)
    expect(res.redirectTo).toEqual({ code: 302, url: '/plus' })
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('opens a customer session for a subscriber and redirects to it', async () => {
    const email = 'sub@example.com'
    mocks.kvHget.mockImplementation(linkAndBill(email, { status: 'active', customerId: 'cust_9' }))
    const res = makeRes()
    await handler(makeReq(email), res)
    expect(String(mocks.fetch.mock.calls[0]![0])).toContain('/v1/customer-sessions/')
    expect(JSON.parse(String(mocks.fetch.mock.calls[0]![1]?.body))).toEqual({ customer_id: 'cust_9' })
    expect(res.redirectTo).toEqual({ code: 302, url: 'https://portal.polar.test/s' })
  })

  it('falls back to /plus when Polar has no session to give', async () => {
    const email = 'nostriperesp@example.com'
    mocks.kvHget.mockImplementation(linkAndBill(email, { status: 'active', customerId: 'cust_9' }))
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    const res = makeRes()
    await handler(makeReq(email), res)
    expect(res.redirectTo).toEqual({ code: 302, url: '/plus' })
  })
})
