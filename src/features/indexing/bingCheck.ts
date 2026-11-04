import { getSubmissionQuota, getUrlInfo, submitUrlBatch, type SubmissionQuota } from './bingAnalytics'
import { upcomingTitles } from './indexCheck'
import { SITE_URL } from '../../lib/site'

export interface BingPendingEntry {
  url: string
  title: string
  state: string
}

export interface BingIndexReport {
  checked: number
  indexed: number
  pending: BingPendingEntry[]
  submitted: number
  quota: SubmissionQuota | null
  errors: { title: string; message: string }[]
}

export async function runBingCheck(topN = 12): Promise<BingIndexReport> {
  const titles = await upcomingTitles(topN)
  const report: BingIndexReport = { checked: titles.length, indexed: 0, pending: [], submitted: 0, quota: null, errors: [] }

  for (const t of titles) {
    const url = `${SITE_URL}/movies/${t.id}`
    try {
      const info = await getUrlInfo(url)
      if (info.inIndex) report.indexed++
      else report.pending.push({ url, title: t.title || url, state: info.state })
    } catch (err) {
      report.errors.push({ title: t.title || url, message: err instanceof Error ? err.message : String(err) })
    }
  }

  // Bing exposes programmatic "request indexing" that Google doesn't — spend
  // the remaining daily quota on whatever the upcoming set is missing. 10 is
  // the conservative default when the quota lookup itself fails.
  if (report.pending.length) {
    report.quota = await getSubmissionQuota().catch(() => null)
    const budget = report.quota ? Math.min(report.quota.daily, report.quota.monthly) : 10
    const batch = report.pending.slice(0, budget).map((p) => p.url)
    if (batch.length) {
      try {
        await submitUrlBatch(batch)
        report.submitted = batch.length
      } catch (err) {
        report.errors.push({ title: 'SubmitUrlBatch', message: err instanceof Error ? err.message : String(err) })
      }
    }
  }
  return report
}
