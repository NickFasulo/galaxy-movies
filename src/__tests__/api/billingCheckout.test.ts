import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/billing/checkout'
import { SYNCKEY_KEY } from '../../utils/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvEval: vi.fn(async () => 1),
  fetch: vi.fn<(input?: unknown, init?: RequestInit) => Promise<Response>>(
    async () => ({ ok: true, json: async () => ({ url: 'https://pay.polar.test/x' }) } as Response)
  )
}))

vi.mock('../../utils/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, eval: mocks.kvEval })
}))
vi.stubGlobal('fetch', mocks.fetch)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'
const EMAIL = 'buyer@example.com'
const KEY = 'abcd1234-abcd-1234-abcd-1234567890ab'

let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

function makeReq(body: unknown): NextApiRequest {
  const ip = nextIp()
  return {
    method: 'POST',
    headers: { 'user-agent': UA, 'x-forwarded-for': ip },
    body,
    socket: { remoteAddress: ip }
  } as unknown as NextApiRequest
}

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: unknown
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

const linked = () => async (key?: string, field?: string) =>
  key === SYNCKEY_KEY && field === EMAIL ? KEY : null

const polarBody = () => JSON.parse(String(mocks.fetch.mock.calls[0]![1]?.body)) as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.POLAR_ACCESS_TOKEN = 'tok'
  process.env.POLAR_PRODUCT_MONTHLY = 'prod_monthly'
  process.env.POLAR_PRODUCT_YEARLY = 'prod_yearly'
})

afterEach(() => {
  delete process.env.POLAR_ACCESS_TOKEN
  delete process.env.POLAR_PRODUCT_MONTHLY
  delete process.env.POLAR_PRODUCT_YEARLY
})

describe('POST /api/billing/checkout', () => {
  it('503s when Polar is not configured', async () => {
    delete process.env.POLAR_ACCESS_TOKEN
    mocks.kvHget.mockImplementation(linked())
    const res = makeRes()
    await handler(makeReq({ email: EMAIL, key: KEY, plan: 'monthly' }), res)
    expect(res.statusCode).toBe(503)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects unlinked credentials before calling Polar', async () => {
    mocks.kvHget.mockResolvedValue(null)
    const res = makeRes()
    await handler(makeReq({ email: EMAIL, key: KEY, plan: 'monthly' }), res)
    expect(res.statusCode).toBe(403)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('creates a monthly checkout stamped with the sync email in metadata', async () => {
    mocks.kvHget.mockImplementation(linked())
    const res = makeRes()
    await handler(makeReq({ email: EMAIL, key: KEY, plan: 'monthly' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ url: 'https://pay.polar.test/x' })
    expect(String(mocks.fetch.mock.calls[0]![0])).toContain('/v1/checkouts/')
    const body = polarBody()
    expect(body.products).toEqual(['prod_monthly'])
    expect(body.customer_email).toBe(EMAIL)
    expect(body.metadata).toEqual({ email: EMAIL, plan: 'monthly' })
  })

  it('maps the yearly plan to the yearly product', async () => {
    mocks.kvHget.mockImplementation(linked())
    const res = makeRes()
    await handler(makeReq({ email: EMAIL, key: KEY, plan: 'yearly' }), res)
    expect(res.statusCode).toBe(200)
    expect(polarBody().products).toEqual(['prod_yearly'])
    expect((polarBody().metadata as Record<string, unknown>).plan).toBe('yearly')
  })

  it('503s when the product id is missing from env', async () => {
    delete process.env.POLAR_PRODUCT_MONTHLY
    mocks.kvHget.mockImplementation(linked())
    const res = makeRes()
    await handler(makeReq({ email: EMAIL, key: KEY, plan: 'monthly' }), res)
    expect(res.statusCode).toBe(503)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('502s when Polar rejects the checkout creation', async () => {
    mocks.kvHget.mockImplementation(linked())
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response)
    const res = makeRes()
    await handler(makeReq({ email: EMAIL, key: KEY, plan: 'monthly' }), res)
    expect(res.statusCode).toBe(502)
  })
})
