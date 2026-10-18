import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { NextApiRequest, NextApiResponse } from 'next'
import handler from '../../pages/api/cron/weekly-digest'
import { CONFIRMED_KEY, ALERTS_PREFS_KEY, BILLING_KEY } from '../../features/alerts/waitlistStore'

const mocks = vi.hoisted(() => ({
  kvHgetall: vi.fn<(key?: string) => Promise<Record<string, unknown> | null>>(async () => null),
  usChanges: vi.fn(async () => ({})),
  inChanges: vi.fn(async () => ({})),
  monthly: vi.fn<(keys: string[]) => Promise<Record<string, unknown>>>(async () => ({}))
}))

vi.mock('../../lib/redis', () => ({ getRedis: () => ({ hgetall: mocks.kvHgetall }) }))
vi.mock('../../features/catalog/streamingChanges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/catalog/streamingChanges')>()),
  getProviderChanges: (keys: string[], opts?: { region?: string }) =>
    opts?.region === 'IN' ? mocks.inChanges() : mocks.usChanges(),
  getMonthlyChanges: (keys: string[]) => mocks.monthly(keys)
}))

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

const makeReq = () =>
  ({ method: 'GET', headers: { authorization: 'Bearer test-secret' } }) as unknown as NextApiRequest

const PLUS = 'plus@example.com'
const FREE = 'free@example.com'

const change = (titles: { tmdbId: number; title: string }[]) => ({
  source: 'Netflix',
  updatedAt: 0,
  added: titles.map((t) => ({ ...t, tmdbType: 'movie' as const, year: 2024 })),
  left: [],
  coming: []
})

const prefsFor = (services: string[]) => ({ watchlist: [], services, region: 'US', updatedAt: 1 })

const fetchSpy = () => vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'test-secret')
  vi.stubEnv('RESEND_API_KEY', 'rk')
  vi.stubGlobal('fetch', fetchSpy())
  mocks.usChanges.mockResolvedValue({ netflix: change([{ tmdbId: 1, title: 'Arrived' }]) })
  mocks.kvHgetall.mockImplementation(async (key) =>
    key === CONFIRMED_KEY ? { [PLUS]: 'tokp', [FREE]: 'tokf' }
      : key === ALERTS_PREFS_KEY ? { [PLUS]: prefsFor(['netflix']), [FREE]: prefsFor(['netflix']) }
      : key === BILLING_KEY ? { [PLUS]: { status: 'active' } }
      : null)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const sentBodies = () =>
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string))

describe('weekly digest — leaving this month', () => {
  it('adds the section only for plus subscribers, deduped across providers', async () => {
    mocks.monthly.mockResolvedValue({
      netflix: { source: 'Netflix', month: '2026-02', updatedAt: 0, arrived: [], coming: [], departed: [
        { tmdbId: 9, tmdbType: 'movie', title: 'Gone Soon', year: 2010, date: '2026-02-20' },
        { tmdbId: 10, tmdbType: 'movie', title: 'Also Gone', year: 2011, date: '2026-02-25' }
      ] },
      hulu: { source: 'Hulu', month: '2026-02', updatedAt: 0, arrived: [], coming: [], departed: [
        { tmdbId: 9, tmdbType: 'movie', title: 'Gone Soon', year: 2010, date: '2026-02-20' }
      ] }
    })

    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(200)
    expect(mocks.monthly).toHaveBeenCalledWith(['netflix'])

    const bodies = sentBodies()
    const plusMail = bodies.find((b) => b.to === PLUS)!
    const freeMail = bodies.find((b) => b.to === FREE)!
    expect(plusMail.html).toContain('Leaving this month')
    expect(plusMail.html).toContain('Gone Soon')
    expect(plusMail.html).toContain('Feb 20')
    expect(plusMail.html.match(/Gone Soon/g)).toHaveLength(1)
    expect(freeMail.html).not.toContain('Leaving this month')
  })

  it('omits the section when monthly data has nothing for the subscriber\'s services', async () => {
    mocks.monthly.mockResolvedValue({})
    const res = makeRes()
    await handler(makeReq(), res)
    const plusMail = sentBodies().find((b) => b.to === PLUS)!
    expect(plusMail.html).toContain('Arrived')
    expect(plusMail.html).not.toContain('Leaving this month')
  })

  it('still sends to a plus subscriber with no stored prefs — just no leaving section', async () => {
    mocks.kvHgetall.mockImplementation(async (key) =>
      key === ALERTS_PREFS_KEY ? { [FREE]: prefsFor(['netflix']) }
        : key === CONFIRMED_KEY ? { [PLUS]: 'tokp', [FREE]: 'tokf' }
        : key === BILLING_KEY ? { [PLUS]: { status: 'active' } }
        : null)
    const res = makeRes()
    await handler(makeReq(), res)
    expect(mocks.monthly).not.toHaveBeenCalled()
    const plusMail = sentBodies().find((b) => b.to === PLUS)!
    expect(plusMail.html).toContain('Arrived')
  })
})
