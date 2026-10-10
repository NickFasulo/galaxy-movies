import { getRedis } from './redis'
import { getProviderChanges, type ProviderChanges } from './streamingChanges'
import { ALERTS_PREFS_KEY, ALERTS_NOTIFIED_KEY, CONFIRMED_KEY, BILLING_KEY } from './waitlistStore'
import { isPlusActive, parseBillingRecord } from './billing'
import { fetchRecommendedMovies, fetchRecommendedTv } from './tmdb'
import { SITE_URL } from './site'
import type { MediaType } from '../types/tmdb'

const TRACKED_PROVIDERS = ['netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max']
const MAX_NOTIFIED_KEYS = 500
const MAX_MATCHES_PER_EMAIL = 20
// Taste matching: a plus subscriber's strongest ratings seed TMDB rec lists,
// cached per source title and shared across all subscribers.
const TASTE_MIN_RATING = 7
const TASTE_SOURCES_PER_SUB = 5
const MAX_RECS_FETCHES_PER_RUN = 25
const RECS_TTL_SECONDS = 60 * 60 * 24 * 30

export interface AlertPrefs {
  watchlist: { id: number; mediaType: MediaType; title: string }[]
  services: string[]
  region: string
  // Absent on snapshots stored before ratings synced — treat as unrated.
  ratings?: { id: number; mediaType: MediaType; title: string; rating: number }[]
  updatedAt: number
}

export interface MatchedItem {
  kind: 'added' | 'coming' | 'leaving' | 'taste'
  notifiedKey: string
  tmdbId: number
  tmdbType: MediaType
  title: string
  provider: string
  date?: string
  season?: number | null
  // For 'taste' matches: the highly-rated title this recommendation came from.
  via?: string
}

// @upstash/redis auto-deserializes JSON hash values, so this is already an
// object (or whatever a hand-edited/corrupt value happens to be) — not a string.
export function parsePrefs(raw: unknown): AlertPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.watchlist) || !Array.isArray(obj.services)) return null
  return obj as unknown as AlertPrefs
}

export interface MatchOptions {
  // Plus: watchlist titles that left a subscribed provider.
  leaving?: boolean
  // Plus: 'movie:123' -> the subscriber's rated title that seeded the rec.
  taste?: Map<string, string>
}

export function matchItems(prefs: AlertPrefs, changes: Record<string, ProviderChanges>, notified: Set<string>, opts: MatchOptions = {}): MatchedItem[] {
  const watchlistKeys = new Set(prefs.watchlist.map((w) => `${w.mediaType}:${w.id}`))
  const out: MatchedItem[] = []

  const push = (match: MatchedItem) => {
    if (notified.has(match.notifiedKey)) return
    out.push(match)
  }

  for (const providerKey of prefs.services) {
    const change = changes[providerKey]
    if (!change) continue

    for (const kind of ['added', 'coming'] as const) {
      for (const item of change[kind]) {
        if (!item.tmdbId || !watchlistKeys.has(`${item.tmdbType}:${item.tmdbId}`)) continue
        push({
          kind,
          notifiedKey: `${kind}:${item.tmdbType}:${item.tmdbId}@${providerKey}`,
          tmdbId: item.tmdbId,
          tmdbType: item.tmdbType,
          title: item.title,
          provider: change.source,
          date: 'date' in item ? item.date : undefined,
          season: 'season' in item ? item.season : undefined
        })
      }
    }

    if (opts.leaving) {
      for (const item of change.left) {
        if (!item.tmdbId || !watchlistKeys.has(`${item.tmdbType}:${item.tmdbId}`)) continue
        push({
          kind: 'leaving',
          notifiedKey: `leaving:${item.tmdbType}:${item.tmdbId}@${providerKey}`,
          tmdbId: item.tmdbId,
          tmdbType: item.tmdbType,
          title: item.title,
          provider: change.source
        })
      }
    }

    if (opts.taste?.size) {
      for (const item of change.added) {
        if (!item.tmdbId) continue
        const key = `${item.tmdbType}:${item.tmdbId}`
        // Watchlisted arrivals already matched as 'added' above.
        if (watchlistKeys.has(key)) continue
        const via = opts.taste.get(key)
        if (!via) continue
        push({
          kind: 'taste',
          notifiedKey: `taste:${item.tmdbType}:${item.tmdbId}@${providerKey}`,
          tmdbId: item.tmdbId,
          tmdbType: item.tmdbType,
          title: item.title,
          provider: change.source,
          via
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

function statusLine(item: MatchedItem): string {
  switch (item.kind) {
    case 'coming':
      return `Coming to ${escapeHtml(item.provider)}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
    case 'leaving':
      return `Leaving ${escapeHtml(item.provider)} soon`
    case 'taste':
      return `Now on ${escapeHtml(item.provider)} — because you rated ${escapeHtml(item.via || '')} highly`
    default:
      return `Now on ${escapeHtml(item.provider)}`
  }
}

export function buildEmail(items: MatchedItem[], email: string, unsubToken: string) {
  const unsub = `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${unsubToken}`
  const rows = items
    .map((item) =>
      `<li style="margin: 4px 0;"><a href="${SITE_URL}${titlePath(item)}" style="color: #2b6cb0;">${escapeHtml(item.title)}</a>` +
      `<span style="color: #666;"> — ${statusLine(item)}</span></li>`
    )
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

function topRatedTitles(prefs: AlertPrefs): { id: number; mediaType: MediaType; title: string }[] {
  return (prefs.ratings || [])
    .filter((r) => r.rating >= TASTE_MIN_RATING && typeof r.id === 'number')
    .sort((a, b) => b.rating - a.rating)
    .slice(0, TASTE_SOURCES_PER_SUB)
}

const recsCacheKey = (mediaType: MediaType, id: number) => `recs:v1:${mediaType}:${id}`

// Every plus subscriber's top-rated titles, deduped. Rec lists live in Redis
// keyed by source title so they're shared across subscribers — one MGET warms
// most of the index, and TMDB backfills are capped to bound run cost.
async function loadRecsIndex(plusPrefs: AlertPrefs[]): Promise<Map<string, number[]>> {
  const kv = getRedis()
  const index = new Map<string, number[]>()
  if (!kv) return index

  const wanted = new Map<string, { id: number; mediaType: MediaType }>()
  for (const prefs of plusPrefs) {
    for (const r of topRatedTitles(prefs)) wanted.set(`${r.mediaType}:${r.id}`, r)
  }
  if (!wanted.size) return index

  const keys = [...wanted.keys()]
  const cached = await kv.mget<(number[] | null)[]>(...keys.map((k) => {
    const [mediaType, id] = k.split(':')
    return recsCacheKey(mediaType as MediaType, Number(id))
  }))

  let fetches = 0
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const val = cached[i]
    if (Array.isArray(val)) {
      index.set(key, val)
      continue
    }
    if (fetches >= MAX_RECS_FETCHES_PER_RUN) continue
    fetches++
    const { id, mediaType } = wanted.get(key)!
    try {
      const data = mediaType === 'tv' ? await fetchRecommendedTv(id) : await fetchRecommendedMovies(id)
      const ids = (data.results || [])
        .map((r) => r?.id)
        .filter((n): n is number => typeof n === 'number')
        .slice(0, 50)
      index.set(key, ids)
      await kv.set(recsCacheKey(mediaType, id), ids, { ex: RECS_TTL_SECONDS })
    } catch (err) {
      console.error(`Recs fetch failed for ${key}:`, err)
    }
  }
  return index
}

// 'mediaType:recId' -> the title the subscriber rated that produced the rec.
function tasteIndexFor(prefs: AlertPrefs, recsIndex: Map<string, number[]>): Map<string, string> {
  const taste = new Map<string, string>()
  for (const r of topRatedTitles(prefs)) {
    for (const recId of recsIndex.get(`${r.mediaType}:${r.id}`) || []) {
      const key = `${r.mediaType}:${recId}`
      if (!taste.has(key)) taste.set(key, r.title)
    }
  }
  return taste
}

export async function sendWatchlistAlerts() {
  if (!process.env.RESEND_API_KEY) return { skipped: 'RESEND_API_KEY not set' }

  const kv = getRedis()
  if (!kv) return { error: 'Redis unavailable' }

  const changes = await getProviderChanges(TRACKED_PROVIDERS, { fresh: true })
  if (Object.keys(changes).length === 0) return { sent: 0, reason: 'no changes available' }

  const [prefsHash, notifiedHash, unsubTokens, billingHash] = await Promise.all([
    kv.hgetall<Record<string, unknown>>(ALERTS_PREFS_KEY),
    kv.hgetall<Record<string, unknown>>(ALERTS_NOTIFIED_KEY),
    kv.hgetall<Record<string, string>>(CONFIRMED_KEY),
    kv.hgetall<Record<string, unknown>>(BILLING_KEY)
  ])

  const entries = Object.entries(prefsHash || {})
  if (!entries.length) return { sent: 0, reason: 'no subscribers' }

  const plusByEmail = new Map<string, AlertPrefs>()
  for (const [email, raw] of entries) {
    if (!isPlusActive(parseBillingRecord(billingHash?.[email]))) continue
    const prefs = parsePrefs(raw)
    if (prefs) plusByEmail.set(email, prefs)
  }
  const recsIndex = await loadRecsIndex([...plusByEmail.values()])

  const from = process.env.RESEND_FROM || 'Galaxy Movies <onboarding@resend.dev>'

  let sent = 0
  let failed = 0

  for (const [email, raw] of entries) {
    const prefs = parsePrefs(raw)
    const unsubToken = unsubTokens?.[email]
    if (!prefs || !unsubToken) continue

    const isPlus = plusByEmail.has(email)
    const storedNotified = notifiedHash?.[email]
    const notified = new Set<string>(Array.isArray(storedNotified) ? storedNotified : [])
    const matches = matchItems(prefs, changes, notified, {
      leaving: isPlus,
      taste: isPlus ? tasteIndexFor(prefs, recsIndex) : undefined
    })
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
