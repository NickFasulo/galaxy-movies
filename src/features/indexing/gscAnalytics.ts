import { gscAccessToken, gscSite } from './indexCheck'
import { SITE_URL } from '../../lib/site'

// Search Analytics + Sitemaps on the webmasters v3 host — the
// searchconsole.googleapis.com host only exposes urlInspection.
const WM_BASE = 'https://www.googleapis.com/webmasters/v3'
const SITEMAP_PATH = `${SITE_URL}/sitemap.xml`

export interface AnalyticsRow {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

interface AnalyticsOpts {
  dimensions: string[]
  rowLimit?: number
  pageContains?: string
}

async function queryAnalytics(startDate: string, endDate: string, opts: AnalyticsOpts): Promise<AnalyticsRow[]> {
  const token = await gscAccessToken()
  const body: Record<string, unknown> = {
    startDate,
    endDate,
    dimensions: opts.dimensions,
    rowLimit: opts.rowLimit ?? 250,
    aggregationType: 'byProperty'
  }
  if (opts.pageContains) {
    body.dimensionFilterGroups = [
      { filters: [{ dimension: 'page', operator: 'contains', expression: opts.pageContains }] }
    ]
  }
  const res = await fetch(`${WM_BASE}/sites/${encodeURIComponent(gscSite())}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`searchAnalytics ${res.status}: ${data?.error?.message}`)
  return data.rows || []
}

export interface SitemapStatus {
  path: string
  lastSubmitted?: string
  lastDownloaded?: string
  isPending?: boolean
  warnings?: number
  errors?: number
  resubmitted: boolean
}

// Resubmit the sitemap (a real recrawl nudge — IndexNow doesn't reach Google)
// and return its status so the email can surface fetch errors.
export async function resubmitAndStatus(): Promise<SitemapStatus> {
  const token = await gscAccessToken()
  const site = encodeURIComponent(gscSite())
  const feed = encodeURIComponent(SITEMAP_PATH)
  const put = await fetch(`${WM_BASE}/sites/${site}/sitemaps/${feed}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` }
  })
  const get = await fetch(`${WM_BASE}/sites/${site}/sitemaps/${feed}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  const data = get.ok ? await get.json() : {}
  const contents = data?.contents?.[0] || {}
  return {
    path: SITEMAP_PATH,
    lastSubmitted: data.lastSubmitted,
    lastDownloaded: data.lastDownloaded,
    isPending: data.isPending,
    warnings: data.warnings ?? contents.warnings,
    errors: data.errors ?? contents.errors,
    resubmitted: put.ok
  }
}

// ---- report shaping (pure, tested) ----

export type Band = 'top10' | 'top20' | 'top50' | 'deep'
export const pageBand = (position: number): Band =>
  position <= 10 ? 'top10' : position <= 20 ? 'top20' : position <= 50 ? 'top50' : 'deep'
const bandRank: Record<Band, number> = { top10: 0, top20: 1, top50: 2, deep: 3 }

export interface BandShift {
  page: string
  from: Band
  to: Band
}

export function bandDiff(cur: Record<string, Band>, prev: Record<string, Band>): { improved: BandShift[]; declined: BandShift[] } {
  const improved: BandShift[] = []
  const declined: BandShift[] = []
  for (const page of new Set([...Object.keys(cur), ...Object.keys(prev)])) {
    const to = cur[page] || 'deep'
    const from = prev[page] || 'deep'
    if (bandRank[to] < bandRank[from]) improved.push({ page, from, to })
    else if (bandRank[to] > bandRank[from]) declined.push({ page, from, to })
  }
  return { improved, declined }
}

export interface Mover {
  key: string
  cur: number
  prev: number
  delta: number
  impressions: number
}

export function clickMovers(cur: AnalyticsRow[], prev: AnalyticsRow[], n = 5): { up: Mover[]; down: Mover[] } {
  const prevByKey = new Map(prev.map((r) => [r.keys.join(''), r]))
  const diffs = cur.map((r) => {
    const prevClicks = prevByKey.get(r.keys.join(''))?.clicks ?? 0
    return {
      key: r.keys[0] || '(other)',
      cur: r.clicks,
      prev: prevClicks,
      delta: r.clicks - prevClicks,
      impressions: r.impressions
    }
  })
  return {
    up: diffs.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, n),
    down: diffs.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, n)
  }
}

export function newQueries(cur: AnalyticsRow[], prev: AnalyticsRow[], minImpressions = 2, n = 8): AnalyticsRow[] {
  const prevKeys = new Set(prev.map((r) => r.keys.join('')))
  return cur
    .filter((r) => !prevKeys.has(r.keys.join('')) && r.impressions >= minImpressions)
    .slice(0, n)
}

export function ctrGaps(rows: AnalyticsRow[], minImpressions = 100, maxCtr = 0.01, n = 8): AnalyticsRow[] {
  return rows
    .filter((r) => r.impressions >= minImpressions && r.ctr < maxCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, n)
}

export function nearClickPages(rows: AnalyticsRow[], n = 8): AnalyticsRow[] {
  return rows
    .filter((r) => r.position >= 8 && r.position <= 25 && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, n)
}

// GSC data lags ~2-3 days, so the "current" week ends 3 days ago.
export function reportWindows() {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const end = new Date(Date.now() - 3 * 86400000)
  const start = new Date(end.getTime() - 6 * 86400000)
  const prevEnd = new Date(start.getTime() - 86400000)
  const prevStart = new Date(prevEnd.getTime() - 6 * 86400000)
  const monthStart = new Date(end.getTime() - 27 * 86400000)
  return {
    cur: { start: iso(start), end: iso(end) },
    prev: { start: iso(prevStart), end: iso(prevEnd) },
    month: { start: iso(monthStart), end: iso(end) }
  }
}

export interface WeeklyDigest {
  rangeLabel: string
  clicks: number
  prevClicks: number
  impressions: number
  prevImpressions: number
  topPages: AnalyticsRow[]
  movers: { up: Mover[]; down: Mover[] }
  newQueries: AnalyticsRow[]
  listsBands: Record<string, Band>
  bandShifts: { improved: BandShift[]; declined: BandShift[] } | null
  nearClick: AnalyticsRow[]
  ctrGaps: AnalyticsRow[] | null
  sitemap: SitemapStatus | null
}

export async function buildWeeklyDigest(prevBands: Record<string, Band> | null, includeCtrGaps: boolean): Promise<WeeklyDigest> {
  const { cur, prev, month } = reportWindows()
  const [totals, prevTotals, topPages, curPages, prevPages, curQueries, prevQueries, listsRows, gapRows] = await Promise.all([
    queryAnalytics(cur.start, cur.end, { dimensions: [] }),
    queryAnalytics(prev.start, prev.end, { dimensions: [] }),
    queryAnalytics(cur.start, cur.end, { dimensions: ['page'], rowLimit: 8 }),
    queryAnalytics(cur.start, cur.end, { dimensions: ['page'], rowLimit: 250 }),
    queryAnalytics(prev.start, prev.end, { dimensions: ['page'], rowLimit: 250 }),
    queryAnalytics(cur.start, cur.end, { dimensions: ['query'], rowLimit: 60 }),
    queryAnalytics(prev.start, prev.end, { dimensions: ['query'], rowLimit: 60 }),
    queryAnalytics(cur.start, cur.end, { dimensions: ['page'], rowLimit: 250, pageContains: '/lists/' }),
    includeCtrGaps ? queryAnalytics(month.start, month.end, { dimensions: ['page'], rowLimit: 500 }) : Promise.resolve(null)
  ])

  const sum = (rows: AnalyticsRow[], k: 'clicks' | 'impressions') => rows.reduce((s, r) => s + r[k], 0)
  const listsBands = Object.fromEntries(listsRows.map((r) => [r.keys[0], pageBand(r.position)]))
  const sitemap = await resubmitAndStatus().catch(() => null)

  return {
    rangeLabel: `${cur.start} → ${cur.end}`,
    clicks: sum(totals, 'clicks'),
    prevClicks: sum(prevTotals, 'clicks'),
    impressions: sum(totals, 'impressions'),
    prevImpressions: sum(prevTotals, 'impressions'),
    topPages,
    movers: clickMovers(curPages, prevPages),
    newQueries: newQueries(curQueries, prevQueries),
    listsBands,
    bandShifts: prevBands ? bandDiff(listsBands, prevBands) : null,
    nearClick: nearClickPages(listsRows),
    ctrGaps: gapRows ? ctrGaps(gapRows) : null,
    sitemap
  }
}
