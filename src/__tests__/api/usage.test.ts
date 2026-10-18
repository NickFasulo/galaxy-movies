import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'

const mocks = vi.hoisted(() => ({
  kv: {
    mget: vi.fn<(...keys: string[]) => Promise<(number | null)[]>>(async () => []),
    hlen: vi.fn<(key: string) => Promise<number>>(async () => 0),
    hgetall: vi.fn<(key: string) => Promise<Record<string, unknown> | null>>(async () => null),
    dbsize: vi.fn(async () => 0),
    get: vi.fn(async () => null),
    eval: vi.fn(async () => 1)
  },
  fetch: vi.fn<(input?: unknown, init?: RequestInit) => Promise<Response>>(
    async () => ({ ok: true, json: async () => ({}) } as Response)
  )
}))

vi.mock('../../lib/redis', () => ({ getRedis: () => mocks.kv }))
vi.mock('../../features/ai/aiUsage', () => ({
  getUsageStats: vi.fn(async () => ({ totalSessions: 5, totalMessages: 42, avgRating: '4.0', timeframe: '24h', timestamp: 0 })),
  getCostEstimate: vi.fn(async () => ({ estimatedCost: '1.2345', source: 'actual_usage', breakdown: {} }))
}))
vi.stubGlobal('fetch', mocks.fetch)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0'
const TOKEN = 'test-dash-token'

let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

function makeReq(auth?: string, method = 'GET'): NextApiRequest {
  const ip = nextIp()
  return {
    method,
    headers: { 'user-agent': UA, 'x-forwarded-for': ip, ...(auth ? { authorization: auth } : {}) },
    socket: { remoteAddress: ip }
  } as unknown as NextApiRequest
}

interface MockRes extends NextApiResponse {
  statusCode: number
  jsonBody: {
    panels?: {
      name: string
      status: string
      metrics: { label: string; value: string; hint?: string }[]
      links?: { label: string; url: string }[]
      error?: string
    }[]
  }
}

function makeRes(): MockRes {
  const res = {
    statusCode: 200,
    jsonBody: undefined as unknown as MockRes['jsonBody'],
    setHeader() {},
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.jsonBody = payload as MockRes['jsonBody']
      return res
    },
    end() { return res }
  }
  return res as unknown as MockRes
}

const handler = async () => (await import('../../pages/api/usage')).default
const panel = (res: MockRes, name: string) => res.jsonBody.panels?.find((p) => p.name === name)

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.kv.mget.mockImplementation(async (...keys: unknown[]) => keys.map(() => null))
  process.env.USAGE_DASH_TOKEN = TOKEN
})

afterEach(() => {
  delete process.env.USAGE_DASH_TOKEN
  delete process.env.POLAR_ACCESS_TOKEN
  delete process.env.POLAR_USAGE_TOKEN
  delete process.env.POLAR_API_BASE
  delete process.env.POLAR_PRODUCT_YEARLY
  delete process.env.CF_ACCOUNT_ID
  delete process.env.CF_ANALYTICS_API_TOKEN
  delete process.env.UPSTASH_EMAIL
  delete process.env.UPSTASH_API_KEY
  delete process.env.UPSTASH_DATABASE_ID
  delete process.env.OPENAI_ADMIN_KEY
  delete process.env.OPENAI_CREDITS_BASELINE
  delete process.env.OPENAI_CREDITS_BASELINE_DATE
  delete process.env.CF_INCLUDED_REQUESTS
  delete process.env.CF_INCLUDED_CPU_MS
})

describe('GET /api/usage', () => {
  it('401s without a token or with the wrong one', async () => {
    const h = await handler()
    for (const auth of [undefined, 'Bearer nope']) {
      const res = makeRes()
      await h(makeReq(auth), res)
      expect(res.statusCode).toBe(401)
    }
  })

  it('401s when USAGE_DASH_TOKEN is unset', async () => {
    delete process.env.USAGE_DASH_TOKEN
    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    expect(res.statusCode).toBe(401)
  })

  it('405s on POST', async () => {
    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`, 'POST'), res)
    expect(res.statusCode).toBe(405)
  })

  it('returns panels with unconfigured sources marked and Redis counters populated', async () => {
    mocks.kv.mget.mockImplementation(async (...keys: unknown[]) =>
      keys.map((k) => (k === 'global_rl:chat:all' ? 123 : k === 'global_rl:watchmode:all' ? 45 : null))
    )
    mocks.kv.hlen.mockImplementation(async (key: unknown) => (key === 'gm:waitlist:confirmed' ? 7 : 0))
    mocks.kv.hgetall.mockImplementation(async (key: unknown) =>
      key === 'gm:billing' ? { 'a@x.co': { status: 'active' }, 'b@x.co': { status: 'canceled', currentPeriodEnd: 0 } } : null
    )
    mocks.kv.dbsize.mockResolvedValue(999)

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    expect(res.statusCode).toBe(200)

    expect(panel(res, 'Cloudflare Workers')?.status).toBe('unconfigured')
    expect(panel(res, 'Upstash Redis')?.status).toBe('unconfigured')
    expect(panel(res, 'OpenAI')?.status).toBe('unconfigured')
    expect(panel(res, 'Polar')?.status).toBe('unconfigured')
    expect(panel(res, 'Finance')?.status).toBe('unconfigured')

    const rateLimits = panel(res, 'Rate limits')
    const subscribers = panel(res, 'Subscribers')
    const aiUsage = panel(res, 'AI usage')
    expect(rateLimits?.status).toBe('ok')
    expect(subscribers?.status).toBe('ok')
    expect(aiUsage?.status).toBe('ok')
    const metric = (p: { metrics: { label: string; value: string }[] } | undefined, label: string) =>
      p?.metrics.find((m) => m.label === label)?.value
    expect(metric(rateLimits, 'Chat calls')).toBe('123')
    expect(metric(rateLimits, 'Watchmode lookups')).toBe('45')
    expect(metric(subscribers, 'Confirmed subscribers')).toBe('7')
    expect(metric(subscribers, 'Plus (entitled)')).toBe('1')
    expect(metric(subscribers, 'DB keys')).toBe('999')
    expect(metric(aiUsage, 'Chat sessions')).toBe('5')

    expect(panel(res, 'Dashboards')?.links?.length).toBeGreaterThan(0)
  })

  it('reports Polar subscription state when its token is set', async () => {
    process.env.POLAR_ACCESS_TOKEN = 'polar-tok'
    process.env.POLAR_PRODUCT_YEARLY = 'prod_year'
    mocks.fetch.mockImplementation(async (input) => {
      expect(String(input)).toContain('/v1/subscriptions')
      return {
        ok: true,
        json: async () => ({
          items: [
            { status: 'active', amount: 499, recurring_interval: 'month' },
            { status: 'active', amount: 4900, recurring_interval: 'year', product_id: 'prod_year' },
            { status: 'canceled', amount: 499, recurring_interval: 'month' }
          ],
          pagination: { total_count: 3 }
        })
      } as Response
    })

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    const polar = panel(res, 'Polar')
    expect(polar?.status).toBe('ok')
    expect(polar?.metrics.find((m) => m.label === 'Active / trialing')?.value).toBe('2')
    expect(polar?.metrics.find((m) => m.label === 'Est. MRR')?.value).toBe('$9.07')

    const finance = panel(res, 'Finance')
    expect(finance?.status).toBe('ok')
    expect(finance?.metrics.find((m) => m.label === 'Income (this month)')?.value).toBe('$0.00')
    expect(finance?.metrics.find((m) => m.label === 'Net (this month)')?.value).toBe('$0.00')
  })

  it('prefers POLAR_USAGE_TOKEN for the panel when both tokens exist', async () => {
    process.env.POLAR_ACCESS_TOKEN = 'billing-tok'
    process.env.POLAR_USAGE_TOKEN = 'usage-tok'
    let auth = ''
    mocks.fetch.mockImplementation(async (_input, init) => {
      auth = String((init?.headers as Record<string, string> | undefined)?.Authorization || '')
      return { ok: true, json: async () => ({ items: [], pagination: {} }) } as Response
    })

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    expect(panel(res, 'Polar')?.status).toBe('ok')
    expect(auth).toBe('Bearer usage-tok')
  })

  it('shows Workers paid-plan quota usage and overage', async () => {
    process.env.CF_ACCOUNT_ID = 'acct'
    process.env.CF_ANALYTICS_API_TOKEN = 'cf-tok'
    mocks.fetch.mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: {
              viewer: {
                accounts: [
                  {
                    workersInvocationsAdaptive: [
                      { sum: { requests: 5_000_000, errors: 3, subrequests: 9 }, quantiles: { cpuTimeP50: 1000, cpuTimeP99: 5000 } },
                      { sum: { requests: 6_000_000, errors: 0, subrequests: 0 }, quantiles: { cpuTimeP50: 2000, cpuTimeP99: 9000 } }
                    ]
                  }
                ]
              }
            }
          })
        }) as Response
    )

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    const cf = panel(res, 'Cloudflare Workers')
    expect(cf?.status).toBe('ok')
    const metric = (label: string) => cf?.metrics.find((m) => m.label === label)
    expect(metric('Requests (billing month)')?.value).toBe('11,000,000 / 10.0M')
    expect(metric('Requests (billing month)')?.hint).toContain('over included')
    expect(metric('Est. CPU (billing month)')?.value).toBe('≥17.0M ms')
    expect(metric('Est. CPU (billing month)')?.hint).toContain('30.0M ms included')
  })

  it('shows OpenAI credit burn-down from the baseline env vars', async () => {
    process.env.OPENAI_ADMIN_KEY = 'admin-tok'
    process.env.OPENAI_CREDITS_BASELINE = '100'
    process.env.OPENAI_CREDITS_BASELINE_DATE = '2026-10-01'
    mocks.fetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/costs')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ results: [{ amount: { value: 12.5 } }, { amount: { value: 7.5 } }] }]
          })
        } as Response
      }
      return { ok: true, json: async () => ({ data: [] }) } as Response
    })

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    const openai = panel(res, 'OpenAI')
    expect(openai?.status).toBe('ok')
    expect(openai?.metrics.find((m) => m.label === 'Credits remaining')?.value).toBe('≈$80.00')
  })

  it('marks a panel error instead of failing when a vendor API rejects', async () => {
    process.env.POLAR_ACCESS_TOKEN = 'polar-tok'
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response)

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    expect(res.statusCode).toBe(200)
    expect(panel(res, 'Polar')?.status).toBe('error')
    expect(panel(res, 'Rate limits')?.status).toBe('ok')
    expect(panel(res, 'Subscribers')?.status).toBe('ok')
    expect(panel(res, 'AI usage')?.status).toBe('ok')
  })
})
