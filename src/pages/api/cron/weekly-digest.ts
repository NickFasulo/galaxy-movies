import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis } from '../../../lib/redis'
import { getProviderChanges, getMonthlyChanges, IN_TRACKED_PROVIDERS, type CatalogTitle, type ComingTitle, type ProviderChanges } from '../../../features/catalog/streamingChanges'
import { ALERTS_PREFS_KEY, BILLING_KEY, CONFIRMED_KEY, SYNCKEY_KEY } from '../../../features/alerts/waitlistStore'
import { parsePrefs } from '../../../features/alerts/watchlistAlerts'
import { isPlusActive, parseBillingRecord, plusLink } from '../../../features/billing/billing'
import { isCronAuthorized } from '../../../lib/auth'
import { shortDate } from '../../../lib/format/formatters'
import { emailCallout, emailLayout, escapeHtml, sendEmail } from '../../../lib/email'
import { SITE_URL, titlePath } from '../../../lib/site'

export const config = { maxDuration: 60 }

const MAX_ITEMS = 10

type DigestItem = (CatalogTitle | ComingTitle) & { provider: string; providerKey: string }

interface DigestItems {
  added: DigestItem[]
  coming: DigestItem[]
}

const prettyDate = shortDate

const itemPath = (t: DigestItem) => titlePath(t.tmdbType, t.tmdbId ?? 0)

function gatherItems(changes: Record<string, ProviderChanges>): DigestItems {
  const seen = new Set<string>()
  const pick = (kind: 'added' | 'coming') => {
    const items: DigestItem[] = []
    for (const [providerKey, change] of Object.entries(changes)) {
      for (const t of change[kind] || []) {
        const id = `${t.tmdbType}:${t.tmdbId}`
        if (seen.has(id)) continue
        seen.add(id)
        items.push({ ...t, provider: change.source, providerKey })
      }
    }
    return items
  }
  return { added: pick('added').slice(0, MAX_ITEMS), coming: pick('coming').slice(0, MAX_ITEMS) }
}

const sectionHead = (label: string) =>
  `<div style="font-size: 15px; font-weight: 700; color: #111827; margin: 20px 0 6px;">${label}</div>`

function itemList(items: DigestItem[], showDate: boolean) {
  if (!items.length) return ''
  return `<ul style="list-style: none; padding: 0; margin: 0 0 6px; color: #1f2937;">${items
    .map(
      (t) =>
        `<li style="margin: 8px 0;"><a href="${SITE_URL}${itemPath(t)}" style="color: #1d4ed8; text-decoration: none; font-weight: 600;">${escapeHtml(t.title)}</a>` +
        `<div style="color: #596579; font-size: 13px; margin-top: 1px;">${escapeHtml(t.provider)}${showDate && 'date' in t && t.date ? `, ${prettyDate(t.date)}` : ''}${'season' in t && t.season ? `, season ${t.season}` : ''}</div></li>`
    )
    .join('')}</ul>`
}

function buildEmail(items: DigestItems, email: string, token: string, leaving: DigestItem[] = [], plusUrl?: string | null) {
  const unsub = `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${token}`
  const html = emailLayout({
    heading: 'This week on streaming',
    preheader: "New arrivals and what's coming to your services",
    body: `
      <p style="margin: 0 0 6px; color: #4b5563; line-height: 1.6;">New arrivals and what's coming to the services you follow on Galaxy Movies.</p>
      ${items.added.length ? `${sectionHead('Just added')}${itemList(items.added, false)}` : ''}
      ${items.coming.length ? `${sectionHead('Coming soon')}${itemList(items.coming, true)}` : ''}
      ${leaving.length ? `${sectionHead('Leaving this month')}${itemList(leaving, true)}` : ''}
      <p style="margin: 22px 0 0;"><a href="${SITE_URL}/new-on-streaming" style="color: #1d4ed8; font-weight: 600; text-decoration: none;">See everything new on streaming →</a></p>
      ${plusUrl ? emailCallout(`Plus members also see what's leaving their services each month and get matched on every provider we track.<span style="display:block; margin-top:8px;"><a href="${plusUrl}" style="color: #1d4ed8; font-weight: 600; text-decoration: none;">See Galaxy Plus →</a></span>`) : ''}`,
    reason: 'You asked for streaming alerts from Galaxy Movies.',
    unsubUrl: unsub
  })
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ skipped: 'RESEND_API_KEY not set' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Redis unavailable' })
  }

  try {
    const [usChanges, inChanges] = await Promise.all([
      getProviderChanges([
        'netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max'
      ], { fresh: true }),
      getProviderChanges(IN_TRACKED_PROVIDERS, { fresh: true, region: 'IN' })
    ])
    const usItems = gatherItems(usChanges)
    const inItems = gatherItems(inChanges)
    if (!usItems.added.length && !usItems.coming.length && !inItems.added.length && !inItems.coming.length) {
      return res.status(200).json({ sent: 0, reason: 'no changes this week' })
    }

    const [confirmed, prefsHash, billingHash, syncKeys] = await Promise.all([
      kv.hgetall<Record<string, string>>(CONFIRMED_KEY),
      kv.hgetall<Record<string, unknown>>(ALERTS_PREFS_KEY),
      kv.hgetall<Record<string, unknown>>(BILLING_KEY),
      kv.hgetall<Record<string, string>>(SYNCKEY_KEY)
    ])
    const entries = Object.entries(confirmed || {})
    if (!entries.length) {
      return res.status(200).json({ sent: 0, reason: 'no subscribers' })
    }

    const results = await Promise.allSettled(
      entries.map(async ([email, token]) => {
        const prefs = parsePrefs(prefsHash?.[email])
        // IN subscribers get the India digest when it has items; the US list is
        // the fallback so nobody loses the weekly email on a quiet week.
        const inHasItems = inItems.added.length + inItems.coming.length > 0
        const items = prefs?.region === 'IN' && inHasItems ? inItems : usItems

        // Plus subscribers also see what departs their services this month —
        // changes:monthly:* is already accumulated by the streaming-changes cron.
        const leaving: DigestItem[] = []
        const isPlus = isPlusActive(parseBillingRecord(billingHash?.[email]))
        if (prefs && isPlus) {
          const monthly = await getMonthlyChanges(prefs.services)
          const seen = new Set<string>()
          for (const [providerKey, m] of Object.entries(monthly)) {
            for (const t of m.departed || []) {
              const id = `${t.tmdbType}:${t.tmdbId}`
              if (!t.tmdbId || seen.has(id)) continue
              seen.add(id)
              leaving.push({ ...t, provider: m.source, providerKey })
            }
          }
          leaving.length = Math.min(leaving.length, MAX_ITEMS)
        }

        const { html, headers } = buildEmail(items, email, token, leaving, isPlus ? null : plusLink(email, syncKeys?.[email]))
        return sendEmail({ to: email, subject: 'New this week on streaming', html, headers })
      })
    )

    const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length
    const failed = results.length - sent
    return res.status(200).json({ sent, failed, total: entries.length })
  } catch (err) {
    console.error('Weekly digest failed:', err)
    return res.status(500).json({ error: 'Digest failed' })
  }
}
