import { getSubmissionQuota, hasBingCredentials, submitUrlBatch } from './bingAnalytics'
import { noindexPaths } from '../../lib/indexability'
import { getRedis } from '../../lib/redis'
import { SITE_URL } from '../../lib/site'

// Bing's URL Submission API is the one real "request indexing" lever it
// exposes — free quota (90/day, ~2.3k/month) that sat ~90% idle while only
// the weekly cron spent ~10 on the upcoming set. This spends it daily: the
// caller's priority URLs first (streaming-changes passes the same set it
// IndexNow-pings — diff'd titles, trending, upcoming releases), then a
// rotating walk through the sitemap so the long tail recrawls ~monthly.
// Pages that noindex themselves are skipped — a submitted noindex URL is a
// wasted quota unit.
const SUBMITTED_KEY = 'gm:bing:submitted' // hash: url -> last-submitted ISO date
const CURSOR_KEY = 'gm:bing:cursor' // offset into the sitemap walk
export const SUBMIT_LOG_KEY = 'gm:bing:submissions' // hash: YYYY-MM-DD -> count
const COOLDOWN_MS = 7 * 86400000
const LOG_KEEP_DAYS = 40

export interface BingSubmitResult {
  submitted: number
  budget: number
  error?: string
}

// The zone sitemap can managed-challenge workerd egress (datacenter fetch,
// not a verified bot) — the workers.dev host bypasses zone WAF rules.
const SITEMAP_HOSTS = [SITE_URL, 'https://galaxy-movies.winter-rice-c91a.workers.dev']

async function fetchSitemapUrls(): Promise<string[]> {
  for (const base of SITEMAP_HOSTS) {
    try {
      const res = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const xml = await res.text()
      return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    } catch {}
  }
  return []
}

export async function submitDailyBatch(priorityUrls: string[]): Promise<BingSubmitResult> {
  const kv = getRedis()
  if (!hasBingCredentials() || !kv) return { submitted: 0, budget: 0 }

  const quota = await getSubmissionQuota().catch(() => null)
  // Unknown quota → spend a conservative 10 rather than risk the monthly cap.
  const budget = quota ? Math.min(quota.daily, quota.monthly) : 10
  if (budget <= 0) return { submitted: 0, budget }

  const [submittedMap, noindex] = await Promise.all([
    kv.hgetall<Record<string, string>>(SUBMITTED_KEY).catch(() => null),
    noindexPaths()
  ])
  const cutoff = Date.now() - COOLDOWN_MS
  const cooledOff = (u: string) => {
    const d = submittedMap?.[u]
    return !d || new Date(d).getTime() < cutoff
  }
  const pathOf = (u: string) => u.slice(SITE_URL.length)
  const eligible = (u: string) => u.startsWith(SITE_URL) && !noindex.has(pathOf(u)) && cooledOff(u)

  const seen = new Set<string>()
  const batch: string[] = []
  const push = (u: string) => {
    if (batch.length < budget && !seen.has(u) && eligible(u)) {
      seen.add(u)
      batch.push(u)
    }
  }
  for (const u of priorityUrls) push(u)

  if (batch.length < budget) {
    const all = await fetchSitemapUrls().catch(() => [] as string[])
    if (all.length) {
      const cursor = Number(await kv.get(CURSOR_KEY).catch(() => null)) || 0
      let i = 0
      for (; i < all.length && batch.length < budget; i++) {
        push(all[(cursor + i) % all.length])
      }
      await kv.set(CURSOR_KEY, (cursor + i) % all.length).catch(() => {})
    }
  }

  if (!batch.length) return { submitted: 0, budget }

  try {
    await submitUrlBatch(batch)
  } catch (err) {
    return { submitted: 0, budget, error: err instanceof Error ? err.message : String(err) }
  }

  await recordSubmissions(batch)
  pruneSubmitLog(kv).catch(() => {})

  return { submitted: batch.length, budget }
}

// Other submitters (the weekly Bing check) record through here so the daily
// batch's cooldown sees their URLs and the report's weekly count stays honest.
export async function recordSubmissions(urls: string[]): Promise<void> {
  const kv = getRedis()
  if (!kv || !urls.length) return
  const today = new Date().toISOString().slice(0, 10)
  await Promise.all([
    kv.hset(SUBMITTED_KEY, Object.fromEntries(urls.map((u) => [u, today]))),
    kv.hincrby(SUBMIT_LOG_KEY, today, urls.length)
  ]).catch(() => {})
}

async function pruneSubmitLog(kv: NonNullable<ReturnType<typeof getRedis>>): Promise<void> {
  const log = await kv.hgetall<Record<string, string | number>>(SUBMIT_LOG_KEY).catch(() => null)
  if (!log) return
  const cutoff = new Date(Date.now() - LOG_KEEP_DAYS * 86400000).toISOString().slice(0, 10)
  const stale = Object.keys(log).filter((d) => d < cutoff)
  if (stale.length) await kv.hdel(SUBMIT_LOG_KEY, ...stale)
}
