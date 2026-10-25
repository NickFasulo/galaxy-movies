import type { NextApiRequest, NextApiResponse } from 'next'
import { hasGscCredentials, pendingSignature, runIndexCheck } from '../../../features/indexing/indexCheck'
import { isCronAuthorized } from '../../../lib/auth'
import { emailLayout, escapeHtml, sendEmail } from '../../../lib/email'
import { getRedis } from '../../../lib/redis'

export const config = { maxDuration: 60 }

const LAST_REPORT_KEY = 'gm:indexing:last-report'
const RECIPIENT = () => process.env.INDEXING_REPORT_EMAIL || 'fasulo.nick@gmail.com'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!hasGscCredentials()) {
    return res.status(200).json({ skipped: 'no GSC credentials' })
  }

  try {
    const report = await runIndexCheck()
    if (!report.pending.length && !report.errors.length) {
      return res.status(200).json({ emailed: false, ...report })
    }

    // An unchanged pending set means the operator already knows — don't
    // re-send the same list every week.
    const signature = pendingSignature(report.pending) + `|e:${report.errors.length}`
    const kv = getRedis()
    const last = await kv?.get<string>(LAST_REPORT_KEY).catch(() => null)
    if (last === signature) {
      return res.status(200).json({ emailed: false, unchanged: true, ...report })
    }

    const rows = report.pending
      .map(
        (p) =>
          // & in href must be escaped — a raw "&id=" breaks the URL in some
          // mail clients and lands on a GSC 404.
          `<p style="margin:14px 0 0; font-size:14px; line-height:1.5;"><a href="${escapeHtml(p.link)}" style="color:#9ec1ff;">${escapeHtml(p.title)} — open inspection report</a><br/><span style="color:#718096; font-size:12px;">${escapeHtml(p.state)} · ${escapeHtml(p.url)}</span></p>`
      )
      .join('')
    const errLine = report.errors.length
      ? `<p style="margin:14px 0 0; color:#718096; font-size:12px;">${report.errors.length} checks errored and were skipped.</p>`
      : ''

    const sent = await sendEmail({
      to: RECIPIENT(),
      subject: `${report.pending.length} upcoming release${report.pending.length === 1 ? '' : 's'} need indexing requests`,
      html: emailLayout({
        heading: 'Indexing requests needed',
        preheader: `${report.pending.length} upcoming release pages aren't in Google's index`,
        reason: 'Weekly indexing check for galaxymovies.app release pages.',
        body:
          `<p style="margin:0; color:#a0aec0; font-size:14px; line-height:1.6;">${report.indexed}/${report.checked} upcoming pages are indexed. These aren't — open each link and click <strong>Request Indexing</strong> (quota ~10-15/day):</p>` +
          rows +
          errLine
      })
    })
    if (sent) await kv?.set(LAST_REPORT_KEY, signature).catch(() => {})
    return res.status(200).json({ emailed: sent, ...report })
  } catch (err) {
    console.error('Indexing report failed:', err)
    return res.status(500).json({ error: 'Indexing report failed' })
  }
}
