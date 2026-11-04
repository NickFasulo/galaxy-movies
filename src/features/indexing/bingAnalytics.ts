import { SITE_URL } from '../../lib/site'

// Bing Webmaster API — JSON endpoints only. The sibling /pox/ and SOAP
// variants retire Aug 31, 2026; api.svc/json is the supported REST surface.
// Two WCF quirks: every response wraps its payload in a "d" envelope, and
// DateTime fields serialize as "/Date(<ms>±offset)/" rather than ISO strings.
const BING_API = 'https://ssl.bing.com/webmaster/api.svc/json'

export const hasBingCredentials = () => Boolean(process.env.BING_WEBMASTER_API_KEY)

// The registered BWT site must match exactly (scheme/host/trailing slash) —
// override via env if the property was added as e.g. the bare apex.
const bingSite = () => process.env.BING_SITE_URL || SITE_URL

// /Date(1696118400000-0700)/ — WCF DataContractJsonSerializer format.
export const parseBingDate = (v: string | undefined | null): string | null => {
  if (!v) return null
  const ticks = v.match(/\/Date\((\d+)/)
  if (ticks) return new Date(Number(ticks[1])).toISOString()
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

interface BingFault {
  Message?: string
  ErrorCode?: number
}

class BingApiError extends Error {
  constructor(
    method: string,
    readonly status: number,
    readonly fault: BingFault | null
  ) {
    super(`bing ${method}: ${fault?.Message || `HTTP ${status}`}`)
  }
}

async function bingApi<T>(method: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const qs = new URLSearchParams({ ...params, apikey: process.env.BING_WEBMASTER_API_KEY || '' })
  const res = await fetch(`${BING_API}/${method}?${qs}`, { signal: AbortSignal.timeout(10000), ...init })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new BingApiError(method, res.status, data?.ApiFault || data?.Error || data)
  return (data?.d ?? data) as T
}

export interface BingUrlInfo {
  url: string
  inIndex: boolean
  httpStatus?: number
  lastCrawled?: string
  state: string
}

// GetUrlInfo is the index record for a single page — a fault response means
// Bing doesn't know the URL, which we report as a state rather than an error.
export async function getUrlInfo(url: string): Promise<BingUrlInfo> {
  try {
    const d = await bingApi<{
      HttpStatus?: number
      LastCrawledDate?: string
    }>('GetUrlInfo', { siteUrl: bingSite(), url })
    return {
      url,
      inIndex: true,
      httpStatus: d?.HttpStatus,
      lastCrawled: parseBingDate(d?.LastCrawledDate) || undefined,
      state: 'in Bing index'
    }
  } catch (err) {
    if (err instanceof BingApiError && (err.status === 401 || err.status === 403)) throw err
    const status = err instanceof BingApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
    return { url, inIndex: false, state: `not in Bing index (${status})` }
  }
}

export interface SubmissionQuota {
  daily: number
  monthly: number
}

export async function getSubmissionQuota(): Promise<SubmissionQuota> {
  const d = await bingApi<{ DailyQuota?: number; MonthlyQuota?: number }>('GetUrlSubmissionQuota', { siteUrl: bingSite() })
  return { daily: d?.DailyQuota ?? 0, monthly: d?.MonthlyQuota ?? 0 }
}

export async function submitUrlBatch(urls: string[]): Promise<void> {
  if (!urls.length) return
  await bingApi('SubmitUrlBatch', {}, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteUrl: bingSite(), urlList: urls })
  })
}

export interface BingDayStat {
  date: string
  clicks: number
  impressions: number
}

// GetRankAndTrafficStats returns daily rows spanning the retention window —
// the caller buckets them into weeks.
export async function getDailyStats(): Promise<BingDayStat[]> {
  const d = await bingApi<{ Date?: string; Clicks?: number; Impressions?: number }[]>(
    'GetRankAndTrafficStats',
    { siteUrl: bingSite() }
  )
  return (Array.isArray(d) ? d : [])
    .map((r) => ({ date: parseBingDate(r.Date)?.slice(0, 10) || '', clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0 }))
    .filter((r) => r.date)
}

export interface BingWeekStats {
  clicks: number
  prevClicks: number
  impressions: number
  prevImpressions: number
}

// Latest 7 days vs the prior 7, measured off the newest row Bing returned
// (their stats lag a few days, same as GSC).
export function weekStats(days: BingDayStat[]): BingWeekStats {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted.at(-1)?.date
  const cur = latest ? new Date(`${latest}T00:00:00Z`).getTime() : Date.now()
  const day = 86400000
  const sum = (from: number, to: number, k: 'clicks' | 'impressions') =>
    sorted.filter((r) => {
      const t = new Date(`${r.date}T00:00:00Z`).getTime()
      return t > cur - from * day && t <= cur - to * day
    }).reduce((s, r) => s + r[k], 0)
  return {
    clicks: sum(7, 0, 'clicks'),
    prevClicks: sum(14, 7, 'clicks'),
    impressions: sum(7, 0, 'impressions'),
    prevImpressions: sum(14, 7, 'impressions')
  }
}
