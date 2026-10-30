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
vi.mock('../../features/indexing/indexCheck', () => ({
  hasGscCredentials: () => Boolean(process.env.GSC_CLIENT_EMAIL && process.env.GSC_PRIVATE_KEY)
}))
vi.mock('../../features/indexing/gscAnalytics', () => ({
  pageBand: (p: number) => (p <= 10 ? 'top10' : p <= 20 ? 'top20' : p <= 50 ? 'top50' : 'deep'),
  reportWindows: () => ({
    cur: { start: '2026-10-16', end: '2026-10-22' },
    prev: { start: '2026-10-09', end: '2026-10-15' },
    month: { start: '2026-09-25', end: '2026-10-22' }
  }),
  queryAnalytics: vi.fn(async (start: string, _end: string, opts: { dimensions: string[] }) => {
    if (opts.dimensions.includes('date')) {
      return [8, 5, 12].map((clicks, i) => ({
        keys: [`2026-10-${20 + i}`],
        clicks,
        impressions: clicks * 80,
        ctr: 0.01,
        position: 12
      }))
    }
    if (opts.dimensions.includes('page')) {
      return [
        { keys: ['https://www.galaxymovies.app/lists/a'], clicks: 2, impressions: 40, ctr: 0.05, position: 15 },
        { keys: ['https://www.galaxymovies.app/lists/b'], clicks: 0, impressions: 30, ctr: 0, position: 42 }
      ]
    }
    return [{ keys: [], clicks: start === '2026-10-16' ? 148 : 213, impressions: 10726, ctr: 0.014, position: 9 }]
  }),
  sitemapStatus: vi.fn(async () => ({
    path: 'https://www.galaxymovies.app/sitemap.xml',
    lastDownloaded: '2026-10-25T06:07:13.256Z',
    isPending: false,
    warnings: 0,
    errors: 59,
    resubmitted: false
  }))
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
      metrics: { label: string; value: string; hint?: string; tone?: string }[]
      series?: { label: string; points: number[]; format?: string; color?: string }[]
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
  delete process.env.CLOUDFLARE_ACCOUNT_ID
  delete process.env.CLOUDFLARE_API_TOKEN
  delete process.env.GSC_CLIENT_EMAIL
  delete process.env.GSC_PRIVATE_KEY
  delete process.env.RESEND_API_KEY
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
      keys.map((k) =>
        k === 'global_rl:chat:all' ? 123
        : k === 'global_rl:watchmode:all' ? 45
        : k === 'global_rl:recs:all' ? 42
        : k === 'global_rl:ai_perplexity:all' ? 700
        : null
      )
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
    expect(panel(res, 'Search Console')?.status).toBe('unconfigured')

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
    expect(metric(rateLimits, 'Recommendations calls')).toBe('42')
    const crawlerRow = rateLimits?.metrics.find((m) => m.label === 'Crawler: Perplexity')
    expect(crawlerRow?.value).toBe('700')
    expect(crawlerRow?.tone).toBe('bad')
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
                      {
                        sum: { requests: 5_000_000, errors: 3, subrequests: 9, cpuTimeUs: 10_000_000_000 },
                        quantiles: { cpuTimeP50: 1000, cpuTimeP99: 5000 }
                      },
                      {
                        sum: { requests: 6_000_000, errors: 0, subrequests: 0, cpuTimeUs: 7_000_000_000 },
                        quantiles: { cpuTimeP50: 2000, cpuTimeP99: 9000 }
                      }
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
    expect(metric('CPU (billing month)')?.value).toBe('17.0M ms')
    expect(metric('CPU (billing month)')?.hint).toContain('30.0M ms included')
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

  it('shows Search Console metrics when GSC creds are set', async () => {
    process.env.GSC_CLIENT_EMAIL = 'sa@x.iam.gserviceaccount.com'
    process.env.GSC_PRIVATE_KEY = 'key'

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)

    const gsc = panel(res, 'Search Console')
    expect(gsc?.status).toBe('ok')
    expect(gsc?.metrics.find((m) => m.label === 'Clicks (7d)')?.value).toBe('148')
    expect(gsc?.metrics.find((m) => m.label === 'Clicks (7d)')?.hint).toContain('vs 213')
    const bands = gsc?.metrics.find((m) => m.label === '/lists/ ranking bands')
    expect(bands?.value).toBe('0 top10 · 1 top20')
    expect(bands?.hint).toContain('1 top50')
    const sitemap = gsc?.metrics.find((m) => m.label === 'Sitemap')
    expect(sitemap?.value).toBe('59 errors')
    expect(sitemap?.tone).toBe('warn')
    expect(gsc?.series?.find((s) => s.label === 'Clicks /day (28d)')?.points).toEqual([8, 5, 12])
    expect(gsc?.series?.find((s) => s.label === 'Impressions /day (28d)')?.color).toBe('yellow')
  })

  it('shows Resend quota usage when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 're_test'
    mocks.fetch.mockImplementation(async (input) => {
      expect(String(input)).toContain('api.resend.com/usage')
      return {
        ok: true,
        json: async () => ({
          emails: {
            daily: { used: 1, sent: 1, received: 0, limit: 100, resets_at: '2026-10-26T23:59:59.999Z' },
            monthly: { used: 22, sent: 22, received: 0, limit: 3000, resets_at: '2026-11-13T16:16:12.201Z' }
          },
          domains: { used: 2, limit: 3 },
          rate_limit: { limit: 10, duration: '1000ms' }
        })
      } as Response
    })

    const res = makeRes()
    await (await handler())(makeReq(`Bearer ${TOKEN}`), res)
    const resend = panel(res, 'Resend')
    expect(resend?.status).toBe('ok')
    expect(resend?.metrics.find((m) => m.label === 'Emails (billing month)')?.value).toBe('22 / 3,000')
    expect(resend?.metrics.find((m) => m.label === 'Emails (billing month)')?.hint).toContain('resets 2026-11-13')
    expect(resend?.metrics.find((m) => m.label === 'Emails today')?.value).toBe('1 / 100')
    expect(resend?.metrics.find((m) => m.label === 'Sending domains')?.value).toBe('2 / 3')
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
