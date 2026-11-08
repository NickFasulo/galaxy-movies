import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  upcomingTitles: vi.fn()
}))

vi.mock('./indexCheck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./indexCheck')>()),
  upcomingTitles: mocks.upcomingTitles
}))
vi.mock('./bingSubmit', () => ({ recordSubmissions: vi.fn(async () => {}) }))

import { runBingCheck } from './bingCheck'

const bingFetch = (indexedIds: Set<number>, failingIds = new Set<number>()) =>
  vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>((input) => {
    const u = String(input)
    if (u.includes('GetUrlInfo')) {
      const id = Number(new URL(u).searchParams.get('url')!.match(/(\d+)$/)![1])
      if (failingIds.has(id)) {
        return Promise.resolve(new Response(JSON.stringify({ ErrorCode: 17, Message: 'ERROR!!! ThrottleIP' }), { status: 400 }))
      }
      return Promise.resolve(
        indexedIds.has(id)
          ? new Response(JSON.stringify({ d: { HttpStatus: 200 } }))
          : new Response(JSON.stringify({ d: { HttpStatus: 0, LastCrawledDate: '/Date(-62135596800000)/' } }))
      )
    }
    if (u.includes('GetUrlSubmissionQuota')) {
      return Promise.resolve(new Response(JSON.stringify({ d: { DailyQuota: 5, MonthlyQuota: 50 } })))
    }
    if (u.includes('SubmitUrlBatch')) {
      return Promise.resolve(new Response(JSON.stringify({ d: null })))
    }
    return Promise.reject(new Error(`unexpected ${u}`))
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  mocks.upcomingTitles.mockReset()
})

describe('runBingCheck', () => {
  it('reports coverage and auto-submits missing pages within quota', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    mocks.upcomingTitles.mockResolvedValue([
      { id: 1, title: 'One' },
      { id: 2, title: 'Two' },
      { id: 3, title: 'Three' }
    ])
    const fetchMock = bingFetch(new Set([1, 3]))
    vi.stubGlobal('fetch', fetchMock)

    const report = await runBingCheck()
    expect(report.checked).toBe(3)
    expect(report.indexed).toBe(2)
    expect(report.pending).toHaveLength(1)
    expect(report.submitted).toBe(1)
    const submitCall = fetchMock.mock.calls.find(([u]) => String(u).includes('SubmitUrlBatch'))
    expect(JSON.parse(submitCall![1]?.body as string).urlList).toEqual(['https://www.galaxymovies.app/movies/2'])
  })

  it('skips submission entirely when every page is already indexed', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    mocks.upcomingTitles.mockResolvedValue([{ id: 1, title: 'One' }])
    const fetchMock = bingFetch(new Set([1]))
    vi.stubGlobal('fetch', fetchMock)

    const report = await runBingCheck()
    expect(report.submitted).toBe(0)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('SubmitUrlBatch'))).toBe(false)
  })

  it('counts persistent API faults as errors, not pending rows', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    mocks.upcomingTitles.mockResolvedValue([
      { id: 1, title: 'One' },
      { id: 2, title: 'Two' }
    ])
    const fetchMock = bingFetch(new Set([1]), new Set([2]))
    vi.stubGlobal('fetch', fetchMock)

    const report = await runBingCheck()
    expect(report.pending).toHaveLength(0)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toContain('ThrottleIP')
    // nothing proven missing → no quota spent on a blind submit
    expect(report.submitted).toBe(0)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('SubmitUrlBatch'))).toBe(false)
  })
})
