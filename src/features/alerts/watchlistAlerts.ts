import { getRedis } from '../../lib/redis'
import { sendTitleWatchAlerts } from './titleAlerts'
import { getProviderChanges, IN_TRACKED_PROVIDERS, type ProviderChanges } from '../catalog/streamingChanges'
import { PROVIDER_NAME_MATCH } from '../catalog/tmdb'
import { ALERTS_PREFS_KEY, ALERTS_NOTIFIED_KEY, CONFIRMED_KEY, BILLING_KEY, DISCORD_KEY, TELEGRAM_KEY, PUSH_KEY, SYNCKEY_KEY } from './waitlistStore'
import { sendTelegramAlert } from './telegram'
import { sendPushAlert, parseStoredSubs } from './webpush'
import { isPlusActive, parseBillingRecord, plusLink } from '../billing/billing'
import { fetchRecommendedMovies, fetchRecommendedTv, fetchTmdb } from '../catalog/tmdb'
import { emailCallout, emailLayout, escapeHtml, sendEmail } from '../../lib/email'
import { SITE_URL } from '../../lib/site'
import type { MediaType, TmdbTvDetails } from '../../types/tmdb'

const TRACKED_PROVIDERS = ['netflix', 'amazon-prime-video', 'hulu', 'disney-plus', 'apple-tv', 'max']
// The streaming-changes cron already fetches and caches diffs for every source
// in PROVIDER_NAME_MATCH — peacock/paramount+ diffs exist but were never read.
// Plus subscribers get matched against all of them at zero added cost.
const PLUS_TRACKED_PROVIDERS = Object.keys(PROVIDER_NAME_MATCH)
// India diffs come from TMDB, not Watchmode — the free tier gets the six
// mainstream services; regional-language providers stay Plus-only.
const IN_BASE_PROVIDERS = ['netflix', 'amazon-prime-video', 'apple-tv', 'jiohotstar', 'zee5', 'sonyliv']
const MAX_NOTIFIED_KEYS = 500
const MAX_MATCHES_PER_EMAIL = 20
// Taste matching: a plus subscriber's strongest ratings seed TMDB rec lists,
// cached per source title and shared across all subscribers.
const TASTE_MIN_RATING = 7
const TASTE_SOURCES_PER_SUB = 5
const MAX_RECS_FETCHES_PER_RUN = 25
const RECS_TTL_SECONDS = 60 * 60 * 24 * 30
// Episode alerts: one free /tv/{id} detail fetch per unique watchlisted show,
// capped per run like the recs backfill.
const MAX_EPISODE_FETCHES_PER_RUN = 40
const EPISODE_WINDOW_DAYS = 14

export interface AlertPrefs {
  watchlist: { id: number; mediaType: MediaType; title: string }[]
  services: string[]
  region: string
  // Absent on snapshots stored before ratings synced — treat as unrated.
  ratings?: { id: number; mediaType: MediaType; title: string; rating: number }[]
  updatedAt: number
}

export interface MatchedItem {
  kind: 'added' | 'coming' | 'leaving' | 'taste' | 'episode'
  notifiedKey: string
  tmdbId: number
  tmdbType: MediaType
  title: string
  provider: string
  date?: string
  season?: number | null
  episode?: number | null
  // For 'taste' matches: the highly-rated title this recommendation came from.
  via?: string
}

// @upstash/redis auto-deserializes JSON hash values, so this is already an
// object (or whatever a hand-edited/corrupt value happens to be) — not a string.
export interface EpisodeAir {
  airDate: string
  season: number | null
  episode: number | null
}

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
  // Plus: tmdb tv id -> upcoming episode air info (see loadEpisodeIndex).
  episodes?: Map<number, EpisodeAir>
  // Restricts which of the subscriber's chosen services get matched — free
  // users stay on the base six even though diffs exist for more.
  providers?: string[]
}

export function matchItems(prefs: AlertPrefs, changes: Record<string, ProviderChanges>, notified: Set<string>, opts: MatchOptions = {}): MatchedItem[] {
  const watchlistKeys = new Set(prefs.watchlist.map((w) => `${w.mediaType}:${w.id}`))
  const out: MatchedItem[] = []

  const push = (match: MatchedItem) => {
    if (notified.has(match.notifiedKey)) return
    out.push(match)
  }

  const allowed = opts.providers ? new Set(opts.providers) : null
  for (const providerKey of prefs.services) {
    if (allowed && !allowed.has(providerKey)) continue
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
      // Scheduled departures share the plain `leaving:` key — the heads-up
      // counts as notified, so the later detection doesn't re-ping.
      for (const item of change.leavingSoon || []) {
        if (!item.tmdbId || !watchlistKeys.has(`${item.tmdbType}:${item.tmdbId}`)) continue
        push({
          kind: 'leaving',
          notifiedKey: `leaving:${item.tmdbType}:${item.tmdbId}@${providerKey}`,
          tmdbId: item.tmdbId,
          tmdbType: item.tmdbType,
          title: item.title,
          provider: change.source,
          date: item.date,
          season: item.season
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

  if (opts.episodes?.size) {
    for (const w of prefs.watchlist) {
      if (w.mediaType !== 'tv') continue
      const ep = opts.episodes.get(w.id)
      if (!ep) continue
      // Episode-scoped key: each new episode re-alerts.
      push({
        kind: 'episode',
        notifiedKey: `episode:tv:${w.id}@s${ep.season ?? 0}e${ep.episode ?? 0}`,
        tmdbId: w.id,
        tmdbType: 'tv',
        title: w.title,
        provider: '',
        date: ep.airDate,
        season: ep.season,
        episode: ep.episode
      })
    }
  }

  return out.slice(0, MAX_MATCHES_PER_EMAIL)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (stamp: string | null | undefined) => {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ''
}

const titlePath = (item: MatchedItem) => `/${item.tmdbType === 'tv' ? 'tv' : 'movies'}/${item.tmdbId}`

const episodeLine = (item: MatchedItem) =>
  `New episode${item.season != null && item.episode != null ? ` S${item.season}E${item.episode}` : ''} airs ${prettyDate(item.date) || 'soon'}`

export function statusLine(item: MatchedItem): string {
  switch (item.kind) {
    case 'coming':
      return `Coming to ${escapeHtml(item.provider)}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
    case 'leaving':
      return `Leaving ${escapeHtml(item.provider)}${item.date ? ` ${prettyDate(item.date)}` : ' soon'}${item.season ? `, season ${item.season}` : ''}`
    case 'episode':
      return episodeLine(item)
    case 'taste':
      return `Now on ${escapeHtml(item.provider)} — because you rated ${escapeHtml(item.via || '')} highly`
    default:
      return `Now on ${escapeHtml(item.provider)}`
  }
}

export function buildEmail(items: MatchedItem[], email: string, unsubToken: string, plusUrl?: string | null) {
  const unsub = `${SITE_URL}/api/waitlist-remove?email=${encodeURIComponent(email)}&token=${unsubToken}`
  const rows = items
    .map((item) =>
      `<li style="margin: 8px 0;"><a href="${SITE_URL}${titlePath(item)}" style="color: #9ec1ff; text-decoration: none; font-weight: 600;">${escapeHtml(item.title)}</a>` +
      `<div style="color: #8f9aa7; font-size: 13px; margin-top: 1px;">${statusLine(item)}</div></li>`
    )
    .join('')

  const html = emailLayout({
    heading: 'Something on your list just moved',
    preheader: `${items.length} update${items.length === 1 ? '' : 's'} for titles on your watchlist`,
    body: `
      <p style="margin: 0 0 14px; color: #93a0ad; line-height: 1.6;">Here's what's new for titles on your Galaxy Movies watchlist.</p>
      <ul style="list-style: none; padding: 0; margin: 0; color: #d7dde4;">${rows}</ul>
      <p style="margin: 22px 0 0;"><a href="${SITE_URL}/watchlist" style="color: #9ec1ff; font-weight: 600; text-decoration: none;">View your list →</a></p>
      ${plusUrl ? emailCallout(`Plus members also get leaving-soon warnings, next-episode alerts, and picks seeded by your ratings — $3/mo or $20/yr. <a href="${plusUrl}" style="color: #9ec1ff; font-weight: 600; text-decoration: none;">See Galaxy Plus →</a>`) : ''}`,
    reason: 'You asked for streaming alerts from Galaxy Movies.',
    unsubUrl: unsub
  })
  return { html, headers: { 'List-Unsubscribe': `<${unsub}>` } }
}

// Discord status lines can't reuse statusLine — embeds render markdown, not HTML.
function discordStatusLine(item: MatchedItem): string {
  switch (item.kind) {
    case 'coming':
      return `Coming to ${item.provider}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
    case 'leaving':
      return `Leaving ${item.provider}${item.date ? ` ${prettyDate(item.date)}` : ' soon'}${item.season ? `, season ${item.season}` : ''}`
    case 'episode':
      return episodeLine(item)
    case 'taste':
      return `Now on ${item.provider} — because you rated ${item.via || ''} highly`
    default:
      return `Now on ${item.provider}`
  }
}

export function buildDiscordMessage(items: MatchedItem[]) {
  const description = items
    .map((item) => `• [${item.title}](${SITE_URL}${titlePath(item)}) — ${discordStatusLine(item)}`)
    .join('\n')
    .slice(0, 4000)
  return {
    embeds: [{
      title: 'Something on your list just moved',
      description,
      color: 0xf5c518
    }]
  }
}

async function sendDiscord(webhookUrl: string, items: MatchedItem[]): Promise<boolean> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDiscordMessage(items))
    })
    return resp.ok
  } catch {
    return false
  }
}

async function sendAlertEmail(items: MatchedItem[], email: string, unsubToken: string, plusUrl?: string | null): Promise<boolean> {
  const { html, headers } = buildEmail(items, email, unsubToken, plusUrl)
  const ok = await sendEmail({ to: email, subject: 'Something on your watchlist just moved', html, headers })
  if (!ok) console.error('Watchlist alert send failed for', email)
  return ok
}

export function topRatedTitles(prefs: AlertPrefs): { id: number; mediaType: MediaType; title: string }[] {
  return (prefs.ratings || [])
    .filter((r) => r.rating >= TASTE_MIN_RATING && typeof r.id === 'number')
    .sort((a, b) => b.rating - a.rating)
    .slice(0, TASTE_SOURCES_PER_SUB)
}

const recsCacheKey = (mediaType: MediaType, id: number) => `recs:v1:${mediaType}:${id}`

// Every plus subscriber's top-rated titles, deduped. Rec lists live in Redis
// keyed by source title so they're shared across subscribers — one MGET warms
// most of the index, and TMDB backfills are capped to bound run cost.
export async function loadRecsIndex(plusPrefs: AlertPrefs[], maxFetches = MAX_RECS_FETCHES_PER_RUN): Promise<Map<string, number[]>> {
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
    if (fetches >= maxFetches) continue
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

export async function fetchNextEpisode(id: number): Promise<EpisodeAir | null> {
  try {
    const data = await fetchTmdb<TmdbTvDetails>(`/tv/${id}`)
    const ep = data?.next_episode_to_air
    if (!ep?.air_date) return null
    return { airDate: ep.air_date, season: ep.season_number ?? null, episode: ep.episode_number ?? null }
  } catch {
    return null
  }
}

const airsWithinDays = (dateStr: string, days: number) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return false
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const diff = Math.round((t - today) / 86400000)
  return diff >= 0 && diff <= days
}

// Unique watchlisted shows across Plus subscribers share one fetch budget —
// an episode airing soon matters to everyone tracking that show.
export async function loadEpisodeIndex(plusPrefs: AlertPrefs[]): Promise<Map<number, EpisodeAir>> {
  const index = new Map<number, EpisodeAir>()
  const ids = [
    ...new Set(
      plusPrefs.flatMap((p) => p.watchlist.filter((w) => w.mediaType === 'tv' && typeof w.id === 'number').map((w) => w.id))
    )
  ].sort((a, b) => a - b)
  if (!ids.length) return index

  // Deterministic daily rotation: lists longer than the cap roll through the
  // fetch budget over successive runs instead of pinning the same first 40.
  const offset = ids.length > MAX_EPISODE_FETCHES_PER_RUN ? Math.floor(Date.now() / 86400000) % ids.length : 0
  const batch = [...ids.slice(offset), ...ids.slice(0, offset)].slice(0, MAX_EPISODE_FETCHES_PER_RUN)
  const results = await Promise.all(batch.map((id) => fetchNextEpisode(id)))
  for (let i = 0; i < batch.length; i++) {
    const ep = results[i]
    if (ep && airsWithinDays(ep.airDate, EPISODE_WINDOW_DAYS)) index.set(batch[i]!, ep)
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

  const [usChanges, inChanges] = await Promise.all([
    getProviderChanges(PLUS_TRACKED_PROVIDERS, { fresh: true }),
    getProviderChanges(IN_TRACKED_PROVIDERS, { fresh: true, region: 'IN' })
  ])
  if (Object.keys(usChanges).length === 0 && Object.keys(inChanges).length === 0) {
    return { sent: 0, reason: 'no changes available' }
  }

  const [prefsHash, notifiedHash, unsubTokens, billingHash, discordHash, telegramHash, pushHash, syncKeys] = await Promise.all([
    kv.hgetall<Record<string, unknown>>(ALERTS_PREFS_KEY),
    kv.hgetall<Record<string, unknown>>(ALERTS_NOTIFIED_KEY),
    kv.hgetall<Record<string, string>>(CONFIRMED_KEY),
    kv.hgetall<Record<string, unknown>>(BILLING_KEY),
    kv.hgetall<Record<string, string>>(DISCORD_KEY),
    kv.hgetall<Record<string, string>>(TELEGRAM_KEY),
    kv.hgetall<Record<string, unknown>>(PUSH_KEY),
    kv.hgetall<Record<string, string>>(SYNCKEY_KEY)
  ])

  // Single-title subscribers are a separate audience — they still get matched
  // even when nobody has synced watchlist prefs.
  const watchResult = await sendTitleWatchAlerts(usChanges, notifiedHash)

  const entries = Object.entries(prefsHash || {})
  if (!entries.length) return { sent: 0, reason: 'no subscribers', watch: watchResult }

  const plusByEmail = new Map<string, AlertPrefs>()
  for (const [email, raw] of entries) {
    if (!isPlusActive(parseBillingRecord(billingHash?.[email]))) continue
    const prefs = parsePrefs(raw)
    if (prefs) plusByEmail.set(email, prefs)
  }
  const [recsIndex, episodeIndex] = await Promise.all([
    loadRecsIndex([...plusByEmail.values()]),
    loadEpisodeIndex([...plusByEmail.values()])
  ])

  let sent = 0
  let failed = 0

  for (const [email, raw] of entries) {
    const prefs = parsePrefs(raw)
    const unsubToken = unsubTokens?.[email]
    if (!prefs || !unsubToken) continue

    const isPlus = plusByEmail.has(email)
    const isIndia = prefs.region === 'IN'
    const storedNotified = notifiedHash?.[email]
    const notified = new Set<string>(Array.isArray(storedNotified) ? storedNotified : [])
    const matches = matchItems(prefs, isIndia ? inChanges : usChanges, notified, {
      leaving: isPlus,
      taste: isPlus ? tasteIndexFor(prefs, recsIndex) : undefined,
      episodes: isPlus ? episodeIndex : undefined,
      providers: isIndia
        ? (isPlus ? IN_TRACKED_PROVIDERS : IN_BASE_PROVIDERS)
        : (isPlus ? PLUS_TRACKED_PROVIDERS : TRACKED_PROVIDERS)
    })
    if (!matches.length) continue

    // Plus subscribers can route alerts to Telegram DMs and/or a Discord
    // webhook — both free for us and them. Push is the free tier's own free
    // channel. Email is the fallback when no channel is configured or every
    // attempt fails.
    let ok = false
    if (isPlus && telegramHash?.[email]) {
      ok = await sendTelegramAlert(telegramHash[email], matches)
    }
    if (isPlus && discordHash?.[email]) {
      ok = (await sendDiscord(discordHash[email], matches)) || ok
    }

    const subs = parseStoredSubs(pushHash?.[email])
    if (subs.length) {
      const push = await sendPushAlert(subs, matches)
      ok = push.ok || ok
      if (push.dead.length) {
        const kept = subs.filter((s) => !push.dead.includes(s.endpoint))
        if (kept.length) {
          await kv.hset(PUSH_KEY, { [email]: kept })
        } else {
          await kv.hdel(PUSH_KEY, email)
        }
      }
    }

    if (!ok) ok = await sendAlertEmail(matches, email, unsubToken, isPlus ? null : plusLink(email, syncKeys?.[email]))

    if (ok) {
      sent++
      const nextNotified = [...notified, ...matches.map((m) => m.notifiedKey)].slice(-MAX_NOTIFIED_KEYS)
      await kv.hset(ALERTS_NOTIFIED_KEY, { [email]: nextNotified })
    } else {
      failed++
    }
  }

  return { sent, failed, total: entries.length, watch: watchResult }
}
