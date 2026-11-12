import type { NextApiRequest, NextApiResponse } from 'next'
import { getDailyStats, hasBingCredentials, weekStats, type BingWeekStats } from '../../../features/indexing/bingAnalytics'
import { runBingCheck, type BingIndexReport } from '../../../features/indexing/bingCheck'
import { SUBMIT_LOG_KEY } from '../../../features/indexing/bingSubmit'
import { hasGscCredentials, pendingSignature, runIndexCheck, runTrailerCheck, upcomingTitles, type IndexReport } from '../../../features/indexing/indexCheck'
import { buildWeeklyDigest, type Band, type BandShift, type WeeklyDigest } from '../../../features/indexing/gscAnalytics'
import { getChatDemand, type ChatDemand } from '../../../features/ai/chatLog'
import { allListings, backlogListings, checkListings, unverifiableListings, type ListingCheck } from '../../../features/listings/check'
import { suggestCtrRewrites, type CtrSuggestion } from '../../../features/indexing/ctrSuggest'
import { isCronAuthorized } from '../../../lib/auth'
import { emailLayout, escapeHtml, sendEmail } from '../../../lib/email'
import { INDEXNOW_STATUS_KEY, type IndexNowStatus } from '../../../lib/indexnow'
import { getRedis } from '../../../lib/redis'

export const config = { maxDuration: 120 }

const LAST_REPORT_KEY = 'gm:indexing:last-report'
const LAST_BANDS_KEY = 'gm:gsc:lists-bands'
// Fresh demand data for the seed-research flow (.devin/skills/seed-research) —
// new queries that appeared this week, kept just past the next report.
const NEW_QUERIES_KEY = 'gm:gsc:new-queries'
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

function indexingSection(report: IndexReport, trailerReport: IndexReport | null, prevSignature: string | null | undefined) {
  const prevSet = new Set((prevSignature || '').split('|').filter(Boolean))
  const row = (p: IndexReport['pending'][number]) => {
    const isNew = !prevSet.has(p.url)
    return `<p style="margin:14px 0 0; font-size:14px; line-height:1.5;"><a href="${escapeHtml(p.link)}" style="color:#1d4ed8;">${escapeHtml(p.title)}${isNew ? ' <span style="color:#92400e; font-size:11px;">NEW</span>' : ''}</a><br/><span style="color:#596579; font-size:12px;">${escapeHtml(p.state)} · ${escapeHtml(p.url)}</span></p>`
  }
  const trailerPending = trailerReport?.pending || []
  const anyPending = report.pending.length + trailerPending.length > 0
  const errors = [...report.errors, ...(trailerReport?.errors || [])]
  return `<p style="margin:0; color:#4b5563; font-size:14px; line-height:1.6;"><strong style="color:#1f2937;">Indexing</strong> · ${report.indexed}/${report.checked} upcoming pages indexed${trailerReport ? ` · ${trailerReport.indexed}/${trailerReport.checked} trailer watch pages` : ''}.${
    anyPending
      ? ' Open each link and click <strong>Request Indexing</strong> (quota ~10-15/day):'
      : ' Nothing needs a manual request this week.'
  }</p>${report.pending.map(row).join('')}${
    trailerPending.length
      ? `<p style="margin:16px 0 0; font-size:13px; color:#1f2937;"><strong>Trailer watch pages pending</strong></p>${trailerPending.map(row).join('')}`
      : ''
  }${errors.length ? `<p style="margin:10px 0 0; color:#596579; font-size:12px;">${errors.length} checks errored and were skipped — ${escapeHtml(errors[0].message)}</p>` : ''}`
}

function digestSection(d: WeeklyDigest, ctrSuggestions: CtrSuggestion[] = []) {
  const s = (html: string) => `<div style="margin-top:22px; padding-top:16px; border-top:1px solid #d1d5db;">${html}</div>`
  const rows = (items: string[]) => items.length ? items.join('') : '<div style="font-size:12px; color:#596579;">none this week</div>'

  const pageRows = (rs: typeof d.topPages) =>
    rs.map((r) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(r.keys[0].replace(/^https:\/\/www\.galaxymovies\.app/, '') || '/')}: ${r.clicks} clicks · ${r.impressions} imp · pos ${r.position.toFixed(0)}</div>`)

  const moverRows = (ms: typeof d.movers.up, sign: string) =>
    ms.map((m) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(m.key.replace(/^https:\/\/www\.galaxymovies\.app/, '') || '/')}: ${m.prev} → ${m.cur} clicks (${sign}${m.delta})</div>`)

  const counts = bandCounts(d.listsBands)
  const top10 = counts.top10
  const top20 = counts.top10 + counts.top20

  const indiaSection =
    s(`<p style="margin:0; color:#4b5563; font-size:14px;"><strong style="color:#1f2937;">India</strong> <span style="font-size:12px; color:#596579;">country=ind</span><br/><span style="font-size:13px;">${d.india.clicks} clicks (${delta(d.india.clicks, d.india.prevClicks)} vs prior wk) · ${d.india.impressions.toLocaleString()} impressions (${delta(d.india.impressions, d.india.prevImpressions)})</span></p>`) +
    (d.india.topQueries.length
      ? s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>Top IN queries</strong></p>${rows(d.india.topQueries.map((q) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">"${escapeHtml(q.keys[0])}" · ${q.clicks} clicks · ${q.impressions} imp · pos ${q.position.toFixed(0)}</div>`))}`)
      : '') +
    (d.india.topPages.length
      ? s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>Top IN pages</strong></p>${rows(pageRows(d.india.topPages))}`)
      : '')

  return (
    s(`<p style="margin:0; color:#4b5563; font-size:14px;"><strong style="color:#1f2937;">This week in Search</strong> <span style="font-size:12px; color:#596579;">${d.rangeLabel}</span><br/><span style="font-size:13px;">${d.clicks} clicks (${delta(d.clicks, d.prevClicks)} vs prior wk) · ${d.impressions.toLocaleString()} impressions (${delta(d.impressions, d.prevImpressions)})</span></p>`) +
    s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>Top pages by clicks</strong></p>${rows(pageRows(d.topPages.slice(0, 6)))}`) +
    indiaSection +
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
      ? s(
          `<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>CTR gaps</strong> <span style="color:#596579; font-size:12px;">impressions ≥100, CTR &lt;1% — rewrite titles/descriptions</span></p>${d.ctrGaps.map((r) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(r.keys[0].replace(/^https:\/\/www\.galaxymovies\.app/, ''))}: ${r.impressions} imp · ${(r.ctr * 100).toFixed(1)}% CTR · pos ${r.position.toFixed(0)}</div>`).join('')}` +
          (ctrSuggestions.some((sg) => sg.title || sg.description)
            ? `<p style="margin:10px 0 4px; color:#596579; font-size:12px;">Suggested rewrites:</p>` +
              ctrSuggestions
                .filter((sg) => sg.title || sg.description)
                .map(
                  (sg) =>
                    `<div style="font-size:12px; color:#4b5563; line-height:1.6; margin-top:6px;">${escapeHtml(sg.page.replace(/^https:\/\/www\.galaxymovies\.app/, '') || '/')}${sg.query ? ` · query "${escapeHtml(sg.query)}"` : ''}<br/><span style="color:#1f2937;">${escapeHtml(sg.title)}</span>${sg.description ? `<br/><span style="color:#596579;">${escapeHtml(sg.description)}</span>` : ''}</div>`
                )
                .join('')
            : '')
        )
      : '') +
    (d.sitemap
      ? s(`<p style="margin:0; color:#4b5563; font-size:13px;"><strong style="color:#1f2937;">Sitemap</strong> · ${d.sitemap.resubmitted ? 'resubmitted' : 'resubmit failed'}${d.sitemap.lastDownloaded ? ` · last fetched ${d.sitemap.lastDownloaded.slice(0, 10)}` : ''}${d.sitemap.errors ? ` · <span style="color:#b91c1c;">${d.sitemap.errors} errors</span>` : ''}${d.sitemap.warnings ? ` · ${d.sitemap.warnings} warnings` : ''}</p>`)
      : '')
  )
}

function bingSection(report: BingIndexReport, stats: BingWeekStats | null, ping: IndexNowStatus | null, weekSubmitted: number) {
  const s = (html: string) => `<div style="margin-top:22px; padding-top:16px; border-top:1px solid #d1d5db;">${html}</div>`
  const rows = report.pending
    .map((p) => `<p style="margin:10px 0 0; font-size:13px; line-height:1.5;"><span style="color:#1f2937;">${escapeHtml(p.title)}</span><br/><span style="color:#596579; font-size:12px;">${escapeHtml(p.state)} · ${escapeHtml(p.url)}</span></p>`)
    .join('')
  const pingLine = ping
    ? `IndexNow last ping: ${ping.ok ? `${ping.urls} urls${ping.via ? ` via ${ping.via}` : ''}` : `<span style="color:#b91c1c;">failed${ping.status ? ` ${ping.status}` : ''}${ping.error ? ` — ${escapeHtml(ping.error)}` : ''}</span>`} · ${escapeHtml(ping.at.slice(0, 16).replace('T', ' '))} UTC`
    : 'IndexNow: no ping recorded yet'
  const statLine = stats
    ? `<br/><span style="font-size:13px;">${stats.clicks} clicks (${delta(stats.clicks, stats.prevClicks)} vs prior wk) · ${stats.impressions.toLocaleString()} impressions (${delta(stats.impressions, stats.prevImpressions)})</span>`
    : ''
  const submitted = report.submitted
    ? ` · ${report.submitted} auto-submitted${report.quota ? ` (quota ${report.quota.daily}/day)` : ''}`
    : ''
  const dailyLine = weekSubmitted ? ` · ${weekSubmitted} URLs pushed this week via daily submission` : ''
  return s(`<p style="margin:0; color:#4b5563; font-size:14px; line-height:1.6;"><strong style="color:#1f2937;">Bing</strong> · ${report.indexed}/${report.checked} upcoming pages in index${submitted}${dailyLine}.${statLine}<br/><span style="font-size:12px; color:#596579;">${pingLine}</span></p>${rows}${report.errors.length ? `<p style="margin:8px 0 0; color:#596579; font-size:12px;">${report.errors.length} Bing calls errored — ${escapeHtml(report.errors[0].message)}</p>` : ''}`)
}

function listingsSection(checks: ListingCheck[]) {
  const s = (html: string) => `<div style="margin-top:22px; padding-top:16px; border-top:1px solid #d1d5db;">${html}</div>`
  const ok = checks.filter((c) => c.ok).length
  const failures = checks.filter((c) => !c.ok && !c.blocked)
  const blocked = checks.filter((c) => !c.ok && c.blocked)
  const unverified = unverifiableListings()
  const backlog = backlogListings()
  const inReview = allListings().filter((l) => l.status === 'in-review').length
  const failureRows = failures
    .map(
      (c) =>
        `<div style="font-size:12px; color:#b91c1c; line-height:1.6;">${escapeHtml(c.name)}: ${c.httpStatus ? `HTTP ${c.httpStatus}` : escapeHtml(c.error || 'failed')}${c.linksBack === false && c.httpStatus === 200 ? ' — page up but no galaxymovies link' : ''}<br/><span style="color:#596579;">${escapeHtml(c.liveUrl)}</span></div>`
    )
    .join('')
  const blockedLine = blocked.length
    ? `<br/><span style="font-size:12px; color:#596579;">${blocked.length} check${blocked.length === 1 ? '' : 's'} WAF-blocked, verify manually if curious (${blocked.map((c) => escapeHtml(c.name)).join(', ')})</span>`
    : ''
  const unverifiedLine = unverified.length
    ? `<br/><span style="font-size:12px; color:#92400e;">${unverified.length} live listing${unverified.length === 1 ? '' : 's'} missing liveUrl (${unverified.map((l) => escapeHtml(l.name)).join(', ')}) — fill in via the directory-submissions skill</span>`
    : ''
  return s(
    `<p style="margin:0; color:#4b5563; font-size:14px; line-height:1.6;"><strong style="color:#1f2937;">Listings</strong> · ${ok}/${checks.length} live URLs still link back · ${inReview} in review · ${backlog.length} in the submission backlog.${blockedLine}${unverifiedLine}</p>${failureRows}`
  )
}

function chatDemandSection(d: ChatDemand) {
  const s = (html: string) => `<div style="margin-top:22px; padding-top:16px; border-top:1px solid #d1d5db;">${html}</div>`
  if (!d.requests) {
    return s(`<p style="margin:0; color:#4b5563; font-size:14px;"><strong style="color:#1f2937;">Chat demand</strong> · no prompts logged this week.</p>`)
  }
  const qRows = d.topQuestions
    .slice(0, 8)
    .map((q) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">"${escapeHtml(q.q)}" · ×${q.count}</div>`)
    .join('')
  const titleRows = d.topTitles
    .slice(0, 8)
    .map((t) => `<div style="font-size:12px; color:#4b5563; line-height:1.6;">${escapeHtml(t.title)} · ×${t.count}</div>`)
    .join('')
  return (
    s(`<p style="margin:0; color:#4b5563; font-size:14px; line-height:1.6;"><strong style="color:#1f2937;">Chat demand</strong> · ${d.requests} prompts logged${d.cached ? ` (${d.cached} served from cache)` : ''} · ${d.plus} from Plus users</p>`) +
    s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>What people ask</strong> <span style="color:#596579; font-size:12px;">exact-phrase counts — keyword + quick-action seeds</span></p>${qRows}`) +
    s(`<p style="margin:0; color:#1f2937; font-size:13px;"><strong>Intent mix</strong><br/><span style="font-size:12px; color:#4b5563;">${escapeHtml(d.topIntents.map((i) => `${i.name} ${i.count}`).join(' · '))}</span></p>`) +
    (titleRows ? s(`<p style="margin:0 0 6px; color:#1f2937; font-size:13px;"><strong>Titles discussed</strong></p>${titleRows}`) : '')
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
    // One upcoming set feeds the detail-page and trailer-page checks — the
    // trailer check additionally resolves each title's videos before
    // inspecting (trailer-less titles' /trailer URLs 404).
    const upcoming = await upcomingTitles()
    const [report, trailerReport, bingReport, bingStats, indexNowStatus, prevSignature, prevBands, chatDemand, submitLog, listingChecks] = await Promise.all([
      runIndexCheck(12, upcoming),
      runTrailerCheck(upcoming).catch((err) => {
        console.error('Trailer check failed:', err)
        return null
      }),
      hasBingCredentials()
        ? runBingCheck().catch((err) => {
            console.error('Bing check failed:', err)
            return null
          })
        : Promise.resolve(null),
      hasBingCredentials() ? getDailyStats().then(weekStats).catch(() => null) : Promise.resolve(null),
      kv?.get<IndexNowStatus>(INDEXNOW_STATUS_KEY).catch(() => null) ?? Promise.resolve(null),
      kv?.get<string>(LAST_REPORT_KEY).catch(() => null),
      kv?.get<Record<string, Band>>(LAST_BANDS_KEY).catch(() => null),
      kv ? getChatDemand(kv).catch(() => null) : Promise.resolve(null),
      kv?.hgetall<Record<string, number>>(SUBMIT_LOG_KEY).catch(() => null) ?? Promise.resolve(null),
      checkListings().catch((err) => {
        console.error('Listings check failed:', err)
        return [] as ListingCheck[]
      })
    ])

    // Daily submission counter — how many URLs the cron pushed to Bing's
    // Submission API in the trailing 7 days.
    const weekStart = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
    const weekSubmitted = Object.entries(submitLog || {})
      .filter(([d]) => d >= weekStart)
      .reduce((s, [, n]) => s + Number(n), 0)

    // CTR-gap section is monthly: include on the first Monday of the month.
    const includeCtrGaps = new Date().getDate() <= 7
    const digest = await buildWeeklyDigest(prevBands ?? null, includeCtrGaps).catch((err) => {
      console.error('Weekly digest failed:', err)
      return null
    })

    // CTR-gap section gets AI-drafted rewrite candidates only on its monthly
    // run (first week of the month) — capped at 5 pages inside the helper.
    const ctrSuggestions = digest?.ctrGaps?.length
      ? await suggestCtrRewrites(digest.ctrGaps).catch((err) => {
          console.error('CTR suggestions failed:', err)
          return [] as CtrSuggestion[]
        })
      : []

    const totalPending = report.pending.length + (trailerReport?.pending.length || 0)
    const subject = totalPending
      ? `${totalPending} page${totalPending === 1 ? '' : 's'} need indexing requests`
      : 'Weekly GSC report: all upcoming pages indexed'

    const sent = await sendEmail({
      to: RECIPIENT(),
      subject,
      html: emailLayout({
        heading: 'Weekly search report',
        preheader: subject,
        reason: 'Weekly indexing + Search Console report for galaxymovies.app.',
        body:
          indexingSection(report, trailerReport, prevSignature) +
          (digest ? digestSection(digest, ctrSuggestions) : '<p style="color:#596579; font-size:12px;">Search Analytics section failed this week.</p>') +
          (bingReport ? bingSection(bingReport, bingStats, indexNowStatus ?? null, weekSubmitted) : '') +
          (chatDemand ? chatDemandSection(chatDemand) : '') +
          listingsSection(listingChecks)
      })
    })
    if (sent) {
      await kv?.set(LAST_REPORT_KEY, pendingSignature([...report.pending, ...(trailerReport?.pending || [])])).catch(() => {})
      if (digest) await kv?.set(LAST_BANDS_KEY, digest.listsBands).catch(() => {})
      if (digest?.newQueries?.length) {
        await kv?.set(
          NEW_QUERIES_KEY,
          digest.newQueries.map((q) => ({ q: q.keys[0], imp: q.impressions, pos: Math.round(q.position) })),
          { ex: 8 * 86400 }
        ).catch(() => {})
      }
    }
    return res.status(200).json({ emailed: sent, report, trailers: trailerReport, digest, bing: bingReport })
  } catch (err) {
    console.error('Indexing report failed:', err)
    return res.status(500).json({ error: 'Indexing report failed' })
  }
}
