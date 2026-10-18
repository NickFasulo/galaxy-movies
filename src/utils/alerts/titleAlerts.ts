import { getRedis } from '../core/redis'
import { ALERTS_NOTIFIED_KEY, WATCH_KEY } from './waitlistStore'
import { SITE_URL } from '../core/site'
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

const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (stamp: string | null | undefined) => {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ''
}

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
      `<li style="margin: 4px 0;"><a href="${SITE_URL}/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}" style="color: #2b6cb0;">${escapeHtml(item.title)}</a>` +
      `<span style="color: #666;"> — ${titleStatusLine(item)}</span></li>`
    )
    .join('')

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #111;">
      <h2 style="margin-bottom: 4px;">A title you're tracking just moved</h2>
      <p style="color: #666; margin-top: 0;">Here's the latest for titles you asked Galaxy Movies to watch.</p>
      <ul style="padding-left: 18px; margin: 6px 0 18px;">${rows}</ul>
      <p style="margin-top: 24px;"><a href="${SITE_URL}" style="color: #2b6cb0;">Track another title →</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 12px;" />
      <p style="color: #999; font-size: 12px;">
        You asked Galaxy Movies to notify you about these titles.
        <a href="${unsub}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>`
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

async function sendWatchEmail(from: string, items: MatchedItem[], email: string, unsubToken: string): Promise<boolean> {
  const { html, headers } = buildWatchEmail(items, email, unsubToken)
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: items.length === 1 ? `${items[0].title}: ${titleStatusLine(items[0])}` : "A title you're tracking just moved",
        html,
        headers
      })
    })
    return resp.ok
  } catch (err) {
    console.error('Title watch alert send failed:', err)
    return false
  }
}

// Called from the watchlist-alerts cron after subscriber matching — shares its
// fresh US diff set and the notified hash so a title event never double-sends.
export async function sendTitleWatchAlerts(
  usChanges: Record<string, ProviderChanges>,
  notifiedHash: Record<string, unknown> | null | undefined,
  from: string
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

    const ok = await sendWatchEmail(from, matches, email, entry.unsub)
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
