import type { NextApiRequest, NextApiResponse } from 'next'
import { hasGscCredentials, pendingSignature, runIndexCheck, type IndexReport } from '../../../features/indexing/indexCheck'
import { buildWeeklyDigest, type Band, type BandShift, type WeeklyDigest } from '../../../features/indexing/gscAnalytics'
import { isCronAuthorized } from '../../../lib/auth'
import { emailLayout, escapeHtml, sendEmail } from '../../../lib/email'
import { getRedis } from '../../../lib/redis'

export const config = { maxDuration: 120 }

const LAST_REPORT_KEY = 'gm:indexing:last-report'
const LAST_BANDS_KEY = 'gm:gsc:lists-bands'
const RECIPIENT = () => process.env.INDEXING_REPORT_EMAIL || 'fasulo.nick@gmail.com'

const delta = (cur: number, prev: number) => {
  const d = cur - prev
  return `${d >= 0 ? '+' : ''}${d}`
}

const bandCounts = (bands: Record<string, Band>) => {
  const counts: Record<Band, number> = { top10: 0, top20: 0, top50: 0, deep: 0 }
  for (const b of Object.values(bands)) counts[b]++
  return counts
}

function shiftsHtml(shifts: BandShift[], arrow: string, color: string) {
  if (!shifts.length) return ''
  return shifts
    .slice(0, 5)
    .map((s) => `<div style="font-size:12px; color:#4b5563;">${arrow} <span style="color:${color};">${escapeHtml(s.page.replace(/^https:\/\/www\.galaxymovies\.app/, ''))}</span> ${s.from} → ${s.to}</div>`)
    .join('')
}

function indexingSection(report: IndexReport, prevSignature: string | null | undefined) {
  const prevSet = new Set((prevSignature || '').split('|').filter(Boolean))
  const rows = report.pending
    .map((p) => {
      const isNew = !prevSet.has(p.url)
      return `<p style="margin:14px 0 0; font-size:14px; line-height:1.5;"><a href="${escapeHtml(p.link)}" style="color:#1d4ed8;">${escapeHtml(p.title)}${isNew ? ' <span style="color:#92400e; font-size:11px;">NEW</span>' : ''}</a><br/><span style="color:#596579; font-size:12px;">${escapeHtml(p.state)} · ${escapeHtml(p.url)}</span></p>`
    })
    .join('')
  return `<p style="margin:0; color:#4b5563; font-size:14px; line-height:1.6;"><strong style="color:#1f2937;">Indexing</strong> · ${report.indexed}/${report.checked} upcoming pages indexed.${
    report.pending.length
      ? ' Open each link and click <strong>Request Indexing</strong> (quota ~10-15/day):'
      : ' Nothing needs a manual request this week.'
  }</p>${rows}${report.errors.length ? `<p style="margin:10px 0 0; color:#596579; font-size:12px;">${report.errors.length} checks errored and were skipped.</p>` : ''}`
}

function digestSection(d: WeeklyDigest) {
  const s = (html: string) => `<div style="margin-top:22px; padding-top:16px; border-top:1px solid #d1d5db;">${html}</div>`
  const rows = (items: string[]) => items.length ? items.join('') : '<div style="font-size:12px; color:#596579;">none this week</div>'

  const pageRows = (rs: typeof d.topPages) =>
    rs.map((r) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(r.keys[0].replace(/^https:\/\/www\.galaxymovies\.app/, '') || '/')}: ${r.clicks} clicks · ${r.impressions} imp · pos ${r.position.toFixed(0)}</div>`)

  const moverRows = (ms: typeof d.movers.up, sign: string) =>
    ms.map((m) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(m.key.replace(/^https:\/\/www\.galaxymovies\.app/, '') || '/')}: ${m.prev} → ${m.cur} clicks (${sign}${m.delta})</div>`)

  const counts = bandCounts(d.listsBands)
  const top10 = counts.top10
  const top20 = counts.top10 + counts.top20

  return (
    s(`<p style="margin:0; color:#4b5563; font-size:14px;"><strong style="color:#1f2937;">This week in Search</strong> <span style="font-size:12px; color:#596579;">${d.rangeLabel}</span><br/><span style="font-size:13px;">${d.clicks} clicks (${delta(d.clicks, d.prevClicks)} vs prior wk) · ${d.impressions.toLocaleString()} impressions (${delta(d.impressions, d.prevImpressions)})</span></p>`) +
    s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>Top pages by clicks</strong></p>${rows(pageRows(d.topPages.slice(0, 6)))}`) +
    (d.movers.up.length || d.movers.down.length
      ? s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>Movers</strong></p>${moverRows(d.movers.up, '+')}${moverRows(d.movers.down, '')}`)
      : '') +
    s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>New queries appearing</strong></p>${rows(d.newQueries.map((q) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">"${escapeHtml(q.keys[0])}" · ${q.impressions} imp · pos ${q.position.toFixed(0)}</div>`))}`) +
    s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>/lists/ position tracker</strong> <span style="color:#596579; font-size:12px;">goal: 10+ pages top-10</span><br/><span style="font-size:12px; color:#4b5563;">${top10} in top 10 · ${top20} in top 20 · ${Object.keys(d.listsBands).length} ranked</span></p>` +
      (d.bandShifts ? shiftsHtml(d.bandShifts.improved, '↑', '#166534') + shiftsHtml(d.bandShifts.declined, '↓', '#b91c1c') : '<div style="font-size:12px; color:#596579;">first run — band shifts appear next week</div>') +
      (d.nearClick.length
        ? `<p style="margin:10px 0 4px; color:#596579; font-size:12px;">Nearing click range (pos 8-25):</p>` +
          d.nearClick.map((r) => `<div style="font-size:12px; color:#4b5563;">${escapeHtml(r.keys[0].replace(/^https:\/\/www\.galaxymovies\.app/, ''))}: pos ${r.position.toFixed(0)} · ${r.impressions} imp</div>`).join('')
        : '')) +
    (d.ctrGaps?.length
      ? s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>CTR gaps</strong> <span style="color:#596579; font-size:12px;">impressions ≥100, CTR &lt;1% — rewrite titles/descriptions</span></p>${d.ctrGaps.map((r) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(r.keys[0].replace(/^https:\/\/www\.galaxymovies\.app/, ''))}: ${r.impressions} imp · ${(r.ctr * 100).toFixed(1)}% CTR · pos ${r.position.toFixed(0)}</div>`).join('')}`)
      : '') +
    (d.sitemap
      ? s(`<p style="margin:0; color:#4b5563; font-size:13px;"><strong style="color:#1f2937;">Sitemap</strong> · ${d.sitemap.resubmitted ? 'resubmitted' : 'resubmit failed'}${d.sitemap.lastDownloaded ? ` · last fetched ${d.sitemap.lastDownloaded.slice(0, 10)}` : ''}${d.sitemap.errors ? ` · <span style="color:#b91c1c;">${d.sitemap.errors} errors</span>` : ''}${d.sitemap.warnings ? ` · ${d.sitemap.warnings} warnings` : ''}</p>`)
      : '')
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!hasGscCredentials()) {
    return res.status(200).json({ skipped: 'no GSC credentials' })
  }

  try {
    const kv = getRedis()
    const [report, prevSignature, prevBands] = await Promise.all([
      runIndexCheck(),
      kv?.get<string>(LAST_REPORT_KEY).catch(() => null),
      kv?.get<Record<string, Band>>(LAST_BANDS_KEY).catch(() => null)
    ])

    // CTR-gap section is monthly: include on the first Monday of the month.
    const includeCtrGaps = new Date().getDate() <= 7
    const digest = await buildWeeklyDigest(prevBands ?? null, includeCtrGaps).catch((err) => {
      console.error('Weekly digest failed:', err)
      return null
    })

    const subject = report.pending.length
      ? `${report.pending.length} upcoming release${report.pending.length === 1 ? '' : 's'} need indexing requests`
      : 'Weekly GSC report: all upcoming pages indexed'

    const sent = await sendEmail({
      to: RECIPIENT(),
      subject,
      html: emailLayout({
        heading: 'Weekly search report',
        preheader: subject,
        reason: 'Weekly indexing + Search Console report for galaxymovies.app.',
        body: indexingSection(report, prevSignature) + (digest ? digestSection(digest) : '<p style="color:#596579; font-size:12px;">Search Analytics section failed this week.</p>')
      })
    })
    if (sent) {
      await kv?.set(LAST_REPORT_KEY, pendingSignature(report.pending)).catch(() => {})
      if (digest) await kv?.set(LAST_BANDS_KEY, digest.listsBands).catch(() => {})
    }
    return res.status(200).json({ emailed: sent, report, digest })
  } catch (err) {
    console.error('Indexing report failed:', err)
    return res.status(500).json({ error: 'Indexing report failed' })
  }
}
