import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSubmissionQuota, getUrlInfo, parseBingDate, submitUrlBatch, weekStats } from './bingAnalytics'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('parseBingDate', () => {
  it('parses the WCF /Date(ms)/ envelope', () => {
    expect(parseBingDate('/Date(1730000000000-0700)/')).toBe(new Date(1730000000000).toISOString())
  })

  it('passes ISO strings through and rejects garbage', () => {
    expect(parseBingDate('2024-10-01T12:00:00Z')).toBe('2024-10-01T12:00:00.000Z')
    expect(parseBingDate('nope')).toBeNull()
    expect(parseBingDate(undefined)).toBeNull()
  })

  it('treats DateTime.MinValue as never-crawled', () => {
    expect(parseBingDate('/Date(-62135596800000)/')).toBeNull()
  })
})

describe('weekStats', () => {
  it('buckets the latest 7 days against the prior 7', () => {
    const rows = [
      { date: '2025-10-19', clicks: 3, impressions: 30 },
      { date: '2025-10-20', clicks: 2, impressions: 20 },
      { date: '2025-10-14', clicks: 4, impressions: 40 },
      { date: '2025-10-13', clicks: 10, impressions: 100 },
      { date: '2025-10-06', clicks: 99, impressions: 999 }
    ]
    expect(weekStats(rows)).toEqual({ clicks: 9, prevClicks: 10, impressions: 90, prevImpressions: 100 })
  })
})

describe('getUrlInfo', () => {
  it('unwraps the d envelope and parses the crawl date', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ d: { HttpStatus: 200, LastCrawledDate: '/Date(1730000000000)/' } })))
    const info = await getUrlInfo('https://www.galaxymovies.app/movies/1')
    expect(info.inIndex).toBe(true)
    expect(info.lastCrawled).toBe(new Date(1730000000000).toISOString())
  })

  it('maps empty records (HttpStatus 0, MinValue dates) to never-crawled', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      json({ d: { HttpStatus: 0, LastCrawledDate: '/Date(-62135596800000)/', IsPage: true } })
    ))
    const info = await getUrlInfo('https://www.galaxymovies.app/movies/1')
    expect(info.inIndex).toBe(false)
    expect(info.state).toBe('never crawled')
    expect(info.lastCrawled).toBeUndefined()
  })

  it('rethrows fault responses — a failed check is not a missing URL', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ ApiFault: { Message: 'UrlNotFound' } }, 400)))
    await expect(getUrlInfo('https://www.galaxymovies.app/movies/1')).rejects.toThrow('UrlNotFound')
  })

  it('retries ThrottleIP faults on a fresh connection', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ ErrorCode: 17, Message: 'ERROR!!! ThrottleIP' }, 400))
      .mockResolvedValueOnce(json({ d: { HttpStatus: 200, LastCrawledDate: '/Date(1730000000000)/' } }))
    vi.stubGlobal('fetch', fetchMock)
    const info = await getUrlInfo('https://www.galaxymovies.app/movies/1')
    expect(info.inIndex).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after repeated throttles and surfaces the fault message', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ ErrorCode: 17, Message: 'ERROR!!! ThrottleIP' }, 400)))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getUrlInfo('https://www.galaxymovies.app/movies/1')).rejects.toThrow('ThrottleIP')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('rethrows auth failures without retrying', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const fetchMock = vi.fn().mockResolvedValue(json({}, 401))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getUrlInfo('https://www.galaxymovies.app/movies/1')).rejects.toThrow('HTTP 401')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('getSubmissionQuota', () => {
  it('reads remaining daily and monthly quota', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ d: { DailyQuota: 8, MonthlyQuota: 40 } })))
    await expect(getSubmissionQuota()).resolves.toEqual({ daily: 8, monthly: 40 })
  })
})

describe('submitUrlBatch', () => {
  it('posts the batch with the registered site and apikey', async () => {
    vi.stubEnv('BING_WEBMASTER_API_KEY', 'k')
    const fetchMock = vi.fn().mockResolvedValue(json({ d: null }))
    vi.stubGlobal('fetch', fetchMock)
    await submitUrlBatch(['https://www.galaxymovies.app/movies/1'])
    expect(String(fetchMock.mock.calls[0][0])).toContain('apikey=k')
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      siteUrl: 'https://www.galaxymovies.app',
      urlList: ['https://www.galaxymovies.app/movies/1']
    })
  })
})
