import { getRedis } from './redis'
import { getProviderChanges, type ProviderChanges } from './streamingChanges'
import { ALERTS_PREFS_KEY, ALERTS_NOTIFIED_KEY, CONFIRMED_KEY } from './waitlistStore'
import { SITE_URL } from './site'
import type { MediaType } from '../types/tmdb'

const TRACKED_PROVIDERS = ['netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max']
const MAX_NOTIFIED_KEYS = 500
const MAX_MATCHES_PER_EMAIL = 20

interface AlertPrefs {
  watchlist: { id: number; mediaType: MediaType; title: string }[]
  services: string[]
  region: string
  updatedAt: number
}

interface MatchedItem {
  kind: 'added' | 'coming'
  notifiedKey: string
  tmdbId: number
  tmdbType: MediaType
  title: string
  provider: string
  date?: string
  season?: number | null
}

// @upstash/redis auto-deserializes JSON hash values, so this is already an
// object (or whatever a hand-edited/corrupt value happens to be) — not a string.
function parsePrefs(raw: unknown): AlertPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.watchlist) || !Array.isArray(obj.services)) return null
  return obj as unknown as AlertPrefs
}

function matchItems(prefs: AlertPrefs, changes: Record<string, ProviderChanges>, notified: Set<string>): MatchedItem[] {
  const watchlistKeys = new Set(prefs.watchlist.map((w) => `${w.mediaType}:${w.id}`))
  const out: MatchedItem[] = []

  for (const providerKey of prefs.services) {
    const change = changes[providerKey]
    if (!change) continue

    for (const kind of ['added', 'coming'] as const) {
      for (const item of change[kind]) {
        if (!item.tmdbId || !watchlistKeys.has(`${item.tmdbType}:${item.tmdbId}`)) continue

        const notifiedKey = `${kind}:${item.tmdbType}:${item.tmdbId}@${providerKey}`
        if (notified.has(notifiedKey)) continue

        out.push({
          kind,
          notifiedKey,
          tmdbId: item.tmdbId,
          tmdbType: item.tmdbType,
          title: item.title,
          provider: change.source,
          date: 'date' in item ? item.date : undefined,
          season: 'season' in item ? item.season : undefined
        })
      }
    }
  }

  return out.slice(0, MAX_MATCHES_PER_EMAIL)
}

const escapeHtml = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (stamp: string | null | undefined) => {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ''
}

const titlePath = (item: MatchedItem) => `/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}`

function buildEmail(items: MatchedItem[], email: string, unsubToken: string) {
  const unsub = `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${unsubToken}`
  const rows = items
    .map((item) => {
      const status = item.kind === 'coming'
        ? `Coming to ${escapeHtml(item.provider)}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
        : `Now on ${escapeHtml(item.provider)}`
      return `<li style="margin: 4px 0;"><a href="${SITE_URL}${titlePath(item)}" style="color: #2b6cb0;">${escapeHtml(item.title)}</a>` +
        `<span style="color: #666;"> — ${status}</span></li>`
    })
    .join('')

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #111;">
      <h2 style="margin-bottom: 4px;">Something on your list just moved</h2>
      <p style="color: #666; margin-top: 0;">Here's what's new for titles on your Galaxy Movies watchlist.</p>
      <ul style="padding-left: 18px; margin: 6px 0 18px;">${rows}</ul>
      <p style="margin-top: 24px;"><a href="${SITE_URL}/watchlist" style="color: #2b6cb0;">View your list →</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0 12px;" />
      <p style="color: #999; font-size: 12px;">
        You asked for streaming alerts from Galaxy Movies.
        <a href="${unsub}" style="color: #999;">Unsubscribe</a>
      </p>
    </div>`
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

export async function sendWatchlistAlerts() {
  if (!process.env.RESEND_API_KEY) return { skipped: 'RESEND_API_KEY not set' }

  const kv = getRedis()
  if (!kv) return { error: 'Redis unavailable' }

  const changes = await getProviderChanges(TRACKED_PROVIDERS)
  if (Object.keys(changes).length === 0) return { sent: 0, reason: 'no changes available' }

  const [prefsHash, notifiedHash, unsubTokens] = await Promise.all([
    kv.hgetall<Record<string, unknown>>(ALERTS_PREFS_KEY),
    kv.hgetall<Record<string, unknown>>(ALERTS_NOTIFIED_KEY),
    kv.hgetall<Record<string, string>>(CONFIRMED_KEY)
  ])

  const entries = Object.entries(prefsHash || {})
  if (!entries.length) return { sent: 0, reason: 'no subscribers' }

  const from = process.env.RESEND_FROM || 'Galaxy Movies <onboarding@resend.dev>'

  let sent = 0
  let failed = 0

  for (const [email, raw] of entries) {
    const prefs = parsePrefs(raw)
    const unsubToken = unsubTokens?.[email]
    if (!prefs || !unsubToken) continue

    const storedNotified = notifiedHash?.[email]
    const notified = new Set<string>(Array.isArray(storedNotified) ? storedNotified : [])
    const matches = matchItems(prefs, changes, notified)
    if (!matches.length) continue

    const { html, headers } = buildEmail(matches, email, unsubToken)
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
          subject: 'Something on your watchlist just moved',
          html,
          headers
        })
      })

      if (resp.ok) {
        sent++
        const nextNotified = [...notified, ...matches.map((m) => m.notifiedKey)].slice(-MAX_NOTIFIED_KEYS)
        await kv.hset(ALERTS_NOTIFIED_KEY, { [email]: nextNotified })
      } else {
        failed++
      }
    } catch (err) {
      console.error('Watchlist alert send failed:', err)
      failed++
    }
  }

  return { sent, failed, total: entries.length }
}
