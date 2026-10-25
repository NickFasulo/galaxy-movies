import { getRedis } from '../../lib/redis'
import { ALERTS_NOTIFIED_KEY, WATCH_KEY } from './waitlistStore'
import { emailLayout, escapeHtml, sendEmail } from '../../lib/email'
import { shortDate } from '../../lib/format/formatters'
import { SITE_URL } from '../../lib/site'
import type { MediaType } from '../../types/tmdb'
import type { CatalogTitle, ComingTitle, ProviderChanges } from '../catalog/streamingChanges'
import type { MatchedItem } from './watchlistAlerts'

// Single-title tracking for visitors who never touch the watchlist product:
// confirm once by email, get pinged when that title arrives on / leaves any
// tracked provider. Deliberately separate from CONFIRMED_KEY so these
// subscribers don't get the weekly digest they never asked for.
export interface WatchTitle {
  tmdbId: number
  tmdbType: MediaType
  title: string
}

export interface WatchEntry {
  unsub: string
  titles: WatchTitle[]
}

export const MAX_WATCH_TITLES = 25

export function parseWatchEntry(raw: unknown): WatchEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.unsub !== 'string' || !Array.isArray(obj.titles)) return null
  const titles = (obj.titles as unknown[]).filter(
    (t): t is WatchTitle =>
      typeof (t as WatchTitle)?.tmdbId === 'number' &&
      typeof (t as WatchTitle)?.title === 'string' &&
      ((t as WatchTitle)?.tmdbType === 'movie' || (t as WatchTitle)?.tmdbType === 'tv')
  )
  return { unsub: obj.unsub, titles }
}

export function mergeWatchTitles(existing: WatchTitle[], incoming: WatchTitle): WatchTitle[] {
  const key = `${incoming.tmdbType}:${incoming.tmdbId}`
  const next = existing.filter((t) => `${t.tmdbType}:${t.tmdbId}` !== key)
  next.unshift(incoming)
  return next.slice(0, MAX_WATCH_TITLES)
}

const MAX_MATCHES = 20

// 'added' is the goal event — once a tracked title lands, tracking ends.
// 'coming'/'left' re-arm on later providers via the dedupe keys.
export function matchWatchEntry(
  entry: WatchEntry,
  changes: Record<string, ProviderChanges>,
  notified: Set<string>
): { matches: MatchedItem[]; arrived: Set<string> } {
  const wanted = new Map(entry.titles.map((t) => [`${t.tmdbType}:${t.tmdbId}`, t]))
  const matches: MatchedItem[] = []
  const arrived = new Set<string>()

  for (const [providerKey, change] of Object.entries(changes)) {
    const scan: [(CatalogTitle | ComingTitle)[], 'added' | 'coming' | 'leaving'][] = [
      [change.added, 'added'],
      [change.coming, 'coming'],
      [change.left, 'leaving']
    ]
    for (const [items, kind] of scan) {
      for (const item of items) {
        if (!item.tmdbId) continue
        const key = `${item.tmdbType}:${item.tmdbId}`
        const tracked = wanted.get(key)
        if (!tracked) continue
        const notifiedKey = `watch:${kind}:${key}@${providerKey}`
        if (notified.has(notifiedKey)) continue
        matches.push({
          kind,
          notifiedKey,
          tmdbId: item.tmdbId,
          tmdbType: item.tmdbType,
          title: tracked.title,
          provider: change.source,
          date: 'date' in item ? item.date : undefined,
          season: 'season' in item ? item.season : undefined
        })
        if (kind === 'added') arrived.add(key)
        if (matches.length >= MAX_MATCHES) return { matches, arrived }
      }
    }
  }
  return { matches, arrived }
}

const prettyDate = shortDate

// Mirrors statusLine in watchlistAlerts for the three kinds title alerts use
// — kept local so this module never has to import its caller.
const titleStatusLine = (item: MatchedItem): string => {
  switch (item.kind) {
    case 'coming':
      return `Coming to ${escapeHtml(item.provider)}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
    case 'leaving':
      return `Left ${escapeHtml(item.provider)}`
    default:
      return `Now streaming on ${escapeHtml(item.provider)}`
  }
}

export function buildWatchEmail(items: MatchedItem[], email: string, unsubToken: string) {
  const unsub = `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${unsubToken}`
  const rows = items
    .map((item) =>
      `<li style="margin: 8px 0;"><a href="${SITE_URL}/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}" style="color: #9ec1ff; text-decoration: none; font-weight: 600;">${escapeHtml(item.title)}</a>` +
      `<div style="color: #718096; font-size: 13px; margin-top: 1px;">${titleStatusLine(item)}</div></li>`
    )
    .join('')

  const html = emailLayout({
    heading: "A title you're tracking just moved",
    preheader: `${items.length} update${items.length === 1 ? '' : 's'} for titles you're tracking`,
    body: `
      <p style="margin: 0 0 14px; color: #a0aec0; line-height: 1.6;">Here's the latest for titles you asked Galaxy Movies to watch.</p>
      <ul style="list-style: none; padding: 0; margin: 0; color: #e2e8f0;">${rows}</ul>
      <p style="margin: 22px 0 0;"><a href="${SITE_URL}" style="color: #9ec1ff; font-weight: 600; text-decoration: none;">Track another title →</a></p>`,
    reason: 'You asked Galaxy Movies to notify you about these titles.',
    unsubUrl: unsub
  })
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

async function sendWatchEmail(items: MatchedItem[], email: string, unsubToken: string): Promise<boolean> {
  const { html, headers } = buildWatchEmail(items, email, unsubToken)
  const ok = await sendEmail({
    to: email,
    subject: items.length === 1 ? `${items[0].title}: ${titleStatusLine(items[0])}` : "A title you're tracking just moved",
    html,
    headers
  })
  if (!ok) console.error('Title watch alert send failed for', email)
  return ok
}

// Called from the watchlist-alerts cron after subscriber matching — shares its
// fresh US diff set and the notified hash so a title event never double-sends.
export async function sendTitleWatchAlerts(
  usChanges: Record<string, ProviderChanges>,
  notifiedHash: Record<string, unknown> | null | undefined
): Promise<{ sent: number; failed: number; tracked: number }> {
  const kv = getRedis()
  if (!kv) return { sent: 0, failed: 0, tracked: 0 }

  const watchHash = await kv.hgetall<Record<string, unknown>>(WATCH_KEY)
  const entries = Object.entries(watchHash || {})
  if (!entries.length) return { sent: 0, failed: 0, tracked: 0 }

  let sent = 0
  let failed = 0
  for (const [email, raw] of entries) {
    const entry = parseWatchEntry(raw)
    if (!entry || !entry.titles.length) continue

    const storedNotified = notifiedHash?.[email]
    const notified = new Set<string>(Array.isArray(storedNotified) ? storedNotified : [])
    const { matches, arrived } = matchWatchEntry(entry, usChanges, notified)
    if (!matches.length) continue

    const ok = await sendWatchEmail(matches, email, entry.unsub)
    if (!ok) {
      failed++
      continue
    }
    sent++

    const remaining = entry.titles.filter((t) => !arrived.has(`${t.tmdbType}:${t.tmdbId}`))
    if (remaining.length) await kv.hset(WATCH_KEY, { [email]: { ...entry, titles: remaining } })
    else await kv.hdel(WATCH_KEY, email)

    const nextNotified = [...notified, ...matches.map((m) => m.notifiedKey)].slice(-500)
    await kv.hset(ALERTS_NOTIFIED_KEY, { [email]: nextNotified })
  }

  return { sent, failed, tracked: entries.length }
}
