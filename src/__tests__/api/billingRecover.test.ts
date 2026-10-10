import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/billing/recover'
import { BILLING_KEY, SYNCKEY_KEY } from '../../utils/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHget: vi.fn<(key?: string, field?: string) => Promise<unknown>>(async () => null),
  kvHset: vi.fn<(key: string, fields: Record<string, unknown>) => Promise<number>>(async () => 1),
  kvEval: vi.fn(async () => 1),
  fetch: vi.fn(async () => ({ ok: true } as Response))
}))

vi.mock('../../utils/redis', () => ({
  getRedis: () => ({ hget: mocks.kvHget, hset: mocks.kvHset, eval: mocks.kvEval })
}))
vi.stubGlobal('fetch', mocks.fetch)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'

let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

function makeReq({ method = 'POST', body }: { method?: string; body?: unknown } = {}): NextApiRequest {
  const ip = nextIp()
  return {
    method,
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

const billingFor = (email: string) => async (key?: string, field?: string) =>
  key === BILLING_KEY && field === email ? { status: 'active' } : null

beforeEach(() => {
  vi.clearAllMocks()
  mocks.kvHget.mockImplementation(async () => null)
  process.env.RESEND_API_KEY = 'test_resend_key'
})

afterEach(() => {
  delete process.env.RESEND_API_KEY
})

describe('POST /api/billing/recover', () => {
  it('mints a sync key and mails the access link when a billing record exists', async () => {
    const email = 'paid@example.com'
    mocks.kvHget.mockImplementation(billingFor(email))
    const res = makeRes()
    await handler(makeReq({ body: { email } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ ok: true })
    expect(mocks.kvHset).toHaveBeenCalledWith(SYNCKEY_KEY, { [email]: expect.any(String) })
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('reuses an existing sync key instead of rotating it', async () => {
    const email = 'haskey@example.com'
    mocks.kvHget.mockImplementation(async (key, field) =>
      key === SYNCKEY_KEY && field === email ? 'existing-key' : billingFor(email)(key, field))
    const res = makeRes()
    await handler(makeReq({ body: { email } }), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.kvHset).not.toHaveBeenCalledWith(SYNCKEY_KEY, expect.anything())
  })

  it('returns the same ok response without writing when no billing record exists', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { email: 'nobody@example.com' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.jsonBody).toEqual({ ok: true })
    expect(mocks.kvHset).not.toHaveBeenCalled()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects malformed emails', async () => {
    const res = makeRes()
    await handler(makeReq({ body: { email: 'not-an-email' } }), res)
    expect(res.statusCode).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('rejects non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })
})
