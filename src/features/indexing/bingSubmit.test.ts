import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  noindex: new Set<string>(),
  kv: {
    hgetall: vi.fn<(key: string) => Promise<Record<string, unknown> | null>>(async () => null),
    hset: vi.fn(async () => 1),
    hincrby: vi.fn(async () => 1),
    hdel: vi.fn(async () => 0),
    get: vi.fn<(key: string) => Promise<unknown>>(async () => null),
    set: vi.fn(async () => 'OK')
  }
}))
vi.mock('../../lib/redis', () => ({ getRedis: () => mocks.kv }))
vi.mock('../../lib/indexability', () => ({ noindexPaths: async () => mocks.noindex }))

import { submitDailyBatch } from './bingSubmit'

const S = 'https://www.galaxymovies.app'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const sitemapXml = (locs: string[]) =>
  `<?xml version="1.0"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`

const bingFetch = ({ daily = 90, monthly = 2290, sitemap = [] as string[], submitOk = true } = {}) =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) => {
    const u = String(input)
    if (u.includes('GetUrlSubmissionQuota')) return Promise.resolve(json({ d: { DailyQuota: daily, MonthlyQuota: monthly } }))
    if (u.includes('SubmitUrlBatch')) {
      return submitOk
        ? Promise.resolve(json({ d: null }))
        : Promise.resolve(json({ ErrorCode: 1, Message: 'Rejected' }, 400))
    }
    if (u.includes('sitemap.xml')) return Promise.resolve(new Response(sitemapXml(sitemap)))
    return Promise.reject(new Error(`unexpected ${u}`))
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  mocks.kv.hgetall.mockImplementation(async () => null)
  mocks.kv.get.mockImplementation(async () => null)
  mocks.noindex.clear()
})

describe('submitDailyBatch', () => {
  it('spends the quota on priority URLs first, then fills from the sitemap walk', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const sitemap = [`${S}/movies/1`, `${S}/tv/2`, `${S}/streaming/netflix`]
    const fetchMock = bingFetch({ daily: 5, sitemap })
    vi.stubGlobal('fetch', fetchMock)

    const res = await submitDailyBatch([`${S}/movies/9`, `${S}/movies/9`]) // dedupe check

    expect(res.submitted).toBe(4)
    const post = fetchMock.mock.calls.find(([u]) => String(u).includes('SubmitUrlBatch'))
    expect(JSON.parse(post![1]?.body as string).urlList).toEqual([
      `${S}/movies/9`, `${S}/movies/1`, `${S}/tv/2`, `${S}/streaming/netflix`
    ])
    expect(mocks.kv.set).toHaveBeenCalledWith('gm:bing:cursor', 0)
    expect(mocks.kv.hset).toHaveBeenCalledWith('gm:bing:submitted', expect.objectContaining({ [`${S}/movies/9`]: expect.any(String) }))
    expect(mocks.kv.hincrby).toHaveBeenCalledWith('gm:bing:submissions', expect.any(String), 4)
  })

  it('skips URLs submitted inside the 7-day cooldown and self-noindexed paths', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const today = new Date().toISOString().slice(0, 10)
    const old = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
    mocks.kv.hgetall.mockImplementation(async (key: string) =>
      key === 'gm:bing:submitted' ? { [`${S}/movies/1`]: today, [`${S}/movies/2`]: old } : null
    )
    mocks.noindex.add('/movies/3')
    const fetchMock = bingFetch({ daily: 5 })
    vi.stubGlobal('fetch', fetchMock)

    const res = await submitDailyBatch([`${S}/movies/1`, `${S}/movies/2`, `${S}/movies/3`, `${S}/movies/4`])

    const post = fetchMock.mock.calls.find(([u]) => String(u).includes('SubmitUrlBatch'))
    expect(JSON.parse(post![1]?.body as string).urlList).toEqual([`${S}/movies/2`, `${S}/movies/4`])
    expect(res.submitted).toBe(2)
  })

  it('resumes the backlog walk from the stored cursor', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    mocks.kv.get.mockImplementation(async (key: string) => (key === 'gm:bing:cursor' ? 2 : null))
    const sitemap = [`${S}/a`, `${S}/b`, `${S}/c`, `${S}/d`]
    const fetchMock = bingFetch({ daily: 3, sitemap })
    vi.stubGlobal('fetch', fetchMock)

    await submitDailyBatch([])

    const post = fetchMock.mock.calls.find(([u]) => String(u).includes('SubmitUrlBatch'))
    expect(JSON.parse(post![1]?.body as string).urlList).toEqual([`${S}/c`, `${S}/d`, `${S}/a`]) // wraps the ring
    expect(mocks.kv.set).toHaveBeenCalledWith('gm:bing:cursor', 1)
  })

  it('does not POST when the quota is exhausted', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const fetchMock = bingFetch({ daily: 0, monthly: 0 })
    vi.stubGlobal('fetch', fetchMock)

    const res = await submitDailyBatch([`${S}/movies/1`])
    expect(res.submitted).toBe(0)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('SubmitUrlBatch'))).toBe(false)
  })

  it('reports the fault and records nothing when Bing rejects the batch', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    vi.stubGlobal('fetch', bingFetch({ submitOk: false }))

    const res = await submitDailyBatch([`${S}/movies/1`])
    expect(res.submitted).toBe(0)
    expect(res.error).toContain('Rejected')
    expect(mocks.kv.hset).not.toHaveBeenCalledWith('gm:bing:submitted', expect.anything())
  })

  it('no-ops without Bing credentials', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await submitDailyBatch([`${S}/movies/1`])
    expect(res.submitted).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
