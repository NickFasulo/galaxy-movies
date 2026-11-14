import { getProviderChanges, type ProviderChanges } from '../catalog/streamingChanges'
import { getRedis } from '../../lib/redis'
import { emailLayout, escapeHtml, sendEmail } from '../../lib/email'
import { BROADCAST_PROVIDERS, providerLabel, recordChannelResult } from './socialBroadcast'
import { SITE_URL } from '../../lib/site'

// Bluesky reply scout — the redditEngage draft loop pointed at the platform
// where this brand's audience lives: find conversations the streaming-changes
// data genuinely answers, draft replies, email them for manual posting.
// There is deliberately no auto-post mode — an automated brand replying to
// humans is how accounts get blocked, so every send is a human hand on the
// quoted post. See .devin/specs/bsky-scout.md.

const SEARCH_QUERIES = [
  '"leaving netflix"',
  '"leaving hulu"',
  '"leaving max"',
  '"leaving prime video"',
  '"leaving disney"',
  '"what to watch"',
  '"what should i watch"',
  '"new on netflix"',
  '"where to watch"',
  '"where can i watch"'
]

const MAX_CANDIDATES = 5
const BSKY_MAX_LEN = 300
// Threads past this many replies are saturated — one more adds nothing.
const SATURATED_REPLIES = 30
const LABEL_BLOCK = new Set(['porn', 'graphic-media', 'nudity'])
const OWN_HANDLE_SUFFIX = 'galaxymovies.app'
const WINDOW_MS = 72 * 3600 * 1000

const SEEN_KEY = 'gm:social:bsky-scout:seen'
const SEEN_TTL = 60 * 60 * 24 * 14
const LAST_KEY = 'gm:social:bsky-scout:last'
const LAST_TTL = 60 * 60 * 24 * 14

export interface ScoutPost {
  uri: string
  handle: string
  text: string
  likeCount: number
  replyCount: number
  labels: string[]
}

export interface ScoutResult {
  status: 'emailed' | 'skipped' | 'failed'
  scanned: number
  filtered: number
  drafted: number
  needsLookup: number
  reason?: string
}

// First matching rule wins. `max` needs the word boundary — 'maximum',
// 'Maxine', 'Mad Max' contexts are why a bare substring can't be trusted.
const PROVIDER_MATCH: [RegExp, string][] = [
  [/\bnetflix\b/i, 'netflix'],
  [/\bhulu\b/i, 'hulu'],
  [/\bmax\b/i, 'max'],
  [/\bdisney\b/i, 'disney-plus'],
  [/\bprime\b|\bamazon\b/i, 'amazon-prime-video'],
  [/\bapple\s*tv\b/i, 'apple-tv']
]
export const matchProvider = (text: string): string | null =>
  PROVIDER_MATCH.find(([re]) => re.test(text))?.[1] ?? null

export type ScoutIntent = 'leaving' | 'watch' | 'where'
const INTENT_MATCH: [RegExp, ScoutIntent][] = [
  [/leav(?:e|es|ing)\b|last chance|going away/i, 'leaving'],
  [/what (?:to|should i) watch|recommend(?: me)?|something to watch/i, 'watch'],
  [/where (?:to|can i) watch/i, 'where']
]
export const matchIntent = (text: string): ScoutIntent | null =>
  INTENT_MATCH.find(([re]) => re.test(text))?.[1] ?? null

export const postUrl = (handle: string, uri: string) =>
  `https://bsky.app/profile/${handle}/post/${uri.split('/').pop()}`

const digestDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const mergedTitles = <T extends { title: string }>(rows: T[]): T[] => {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = r.title.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Reply drafting — plain community voice, exactly one link, ≤300 chars.
// Long title lists shed trailing titles until the reply fits; a provider
// block with nothing useful for the intent produces '' and the candidate
// is skipped.
export function draftReply(
  intent: Exclude<ScoutIntent, 'where'>,
  provider: string | null,
  changes: Record<string, ProviderChanges>
): string {
  const label = provider ? providerLabel(provider) : 'streaming'
  const url = `${SITE_URL}/leaving${provider ? `/${provider}` : ''}`

  if (intent === 'leaving') {
    const rows = mergedTitles(
      (provider ? [provider] : BROADCAST_PROVIDERS).flatMap((key) => changes[key]?.leavingSoon || [])
    )
      .filter((t) => t.date)
      .sort((a, b) => a.date.localeCompare(b.date) || (b.popularity ?? 0) - (a.popularity ?? 0))
    for (let n = Math.min(rows.length, 4); n >= 1; n--) {
      const titles = rows
        .slice(0, n)
        .map((t) => `${t.title} (${digestDate(t.date)})`)
        .join(', ')
      const text = `Also leaving ${label} this month: ${titles} — full calendar: ${url}`
      if (text.length <= BSKY_MAX_LEN) return text
    }
    return ''
  }

  const rows = mergedTitles(
    (provider ? [provider] : BROADCAST_PROVIDERS).flatMap((key) => changes[key]?.added || [])
  )
  for (let n = Math.min(rows.length, 3); n >= 1; n--) {
    const titles = rows
      .slice(0, n)
      .map((t) => t.title)
      .join(', ')
    const text = `New on ${label} this week: ${titles} — full list updated daily: ${url}`
    if (text.length <= BSKY_MAX_LEN) return text
  }
  return ''
}

// The public appview serves searchPosts unauthenticated; bsky.social wants a
// session, so it's only touched when the public endpoint refuses (4xx) —
// mirrors socialChannels.bsky's createSession half.
async function bskySession(): Promise<string | null> {
  if (!process.env.BSKY_HANDLE || !process.env.BSKY_APP_PASSWORD) return null
  const resp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD })
  }).catch(() => null)
  if (!resp?.ok) return null
  const data = await resp.json().catch(() => null)
  return data?.accessJwt ?? null
}

const parsePosts = (json: unknown): ScoutPost[] => {
  const posts = (json as { posts?: unknown[] })?.posts
  if (!Array.isArray(posts)) return []
  return posts.map((p) => {
    const post = p as {
      uri?: string
      author?: { handle?: string }
      record?: { text?: string }
      likeCount?: number
      replyCount?: number
      labels?: { val?: string }[]
    }
    return {
      uri: post.uri || '',
      handle: post.author?.handle || '',
      text: post.record?.text || '',
      likeCount: post.likeCount ?? 0,
      replyCount: post.replyCount ?? 0,
      labels: (post.labels || []).map((l) => l.val || '').filter(Boolean)
    }
  })
}

async function searchPosts(query: string, since: string): Promise<ScoutPost[] | null> {
  const params = `?q=${encodeURIComponent(query)}&sort=latest&lang=en&limit=25&since=${encodeURIComponent(since)}`
  const pub = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts${params}`).catch(() => null)
  if (pub?.ok) return parsePosts(await pub.json().catch(() => null))
  if (pub && pub.status >= 400 && pub.status < 500) {
    const jwt = await bskySession()
    if (!jwt) return null
    const resp = await fetch(`https://bsky.social/xrpc/app.bsky.feed.searchPosts${params}`, {
      headers: { Authorization: `Bearer ${jwt}` }
    }).catch(() => null)
    if (resp?.ok) return parsePosts(await resp.json().catch(() => null))
  }
  return null
}

const scoutEmail = () =>
  process.env.REDDIT_ENGAGE_EMAIL || process.env.INDEXING_REPORT_EMAIL || 'fasulo.nick@gmail.com'

interface Draft {
  post: ScoutPost
  url: string
  reply: string
}

const emailBody = (drafts: Draft[], stats: { scanned: number; filtered: number; needsLookup: number }) =>
  drafts
    .map((d) => {
      const quote = d.post.text.length > 200 ? `${d.post.text.slice(0, 197)}…` : d.post.text
      return (
        `<div style="margin:16px 0; padding:12px 14px; border:1px solid #e5e7eb; border-radius:8px;">` +
        `<div style="font-size:13px; color:#4b5563; font-style:italic;">&ldquo;${escapeHtml(quote)}&rdquo;</div>` +
        `<div style="font-size:12px; color:#6b7280; margin-top:6px;">@${escapeHtml(d.post.handle)} · ♥ ${d.post.likeCount} 💬 ${d.post.replyCount} · <a href="${escapeHtml(d.url)}" style="color:#1d4ed8;">open post</a></div>` +
        `<pre style="font-size:13px; background:#f4f4f5; padding:10px; border-radius:6px; white-space:pre-wrap; margin:10px 0 0;">${escapeHtml(d.reply)}</pre>` +
        `</div>`
      )
    })
    .join('') +
  `<p style="font-size:12px; color:#6b7280; margin-top:18px;">${stats.scanned} posts scanned, ${stats.filtered} filtered, ${drafts.length} drafts` +
  (stats.needsLookup ? ` · ${stats.needsLookup} skipped: needs title lookup` : '') +
  `</p>`

export async function runBskyScout(now = new Date()): Promise<ScoutResult> {
  const kv = getRedis()
  // Same health-record contract as the broadcasts — failures and quiet runs
  // both surface in the indexing-report Social block.
  const finish = async (r: ScoutResult): Promise<ScoutResult> => {
    if (kv) await recordChannelResult(kv, 'bsky-scout', 'scout', r)
    return r
  }
  const stats = { scanned: 0, filtered: 0, drafted: 0, needsLookup: 0 }

  if (!process.env.RESEND_API_KEY) return finish({ ...stats, status: 'skipped', reason: 'no email target' })

  const since = new Date(now.getTime() - WINDOW_MS).toISOString()
  const byUri = new Map<string, ScoutPost>()
  for (const q of SEARCH_QUERIES) {
    const posts = await searchPosts(q, since)
    for (const p of posts || []) {
      stats.scanned++
      if (p.uri && !byUri.has(p.uri)) byUri.set(p.uri, p)
    }
  }

  const seen = kv ? new Set(await kv.smembers<string[]>(SEEN_KEY).catch(() => [])) : new Set<string>()
  const candidates = [...byUri.values()].filter((p) => {
    if (p.handle.endsWith(OWN_HANDLE_SUFFIX)) return false
    if (p.replyCount > SATURATED_REPLIES) return false
    if (p.labels.some((v) => LABEL_BLOCK.has(v))) return false
    if (seen.has(p.uri)) return false
    return true
  })

  const scored = candidates
    .map((p) => ({ p, score: p.likeCount + 3 * p.replyCount }))
    .sort((a, b) => b.score - a.score)

  const changes = await getProviderChanges(BROADCAST_PROVIDERS)

  const drafts: Draft[] = []
  for (const { p } of scored) {
    if (drafts.length >= MAX_CANDIDATES) break
    const intent = matchIntent(p.text)
    if (!intent) continue
    // where-to-watch posts are title lookups we can't resolve yet — count
    // them so the email footer shows whether a v2 lookup surface is worth it.
    if (intent === 'where') {
      stats.needsLookup++
      continue
    }
    const reply = draftReply(intent, matchProvider(p.text), changes)
    if (!reply) continue
    drafts.push({ post: p, url: postUrl(p.handle, p.uri), reply })
  }
  // filtered = scanned posts that produced neither a draft nor a
  // needs-lookup note (dupes, self, saturated, labelled, seen, no intent,
  // empty provider blocks, and scored-out extras).
  stats.filtered = stats.scanned - drafts.length - stats.needsLookup
  stats.drafted = drafts.length

  if (!drafts.length) return finish({ ...stats, status: 'skipped', reason: 'no candidates' })

  const body = emailBody(drafts, stats)
  const last = kv ? await kv.get<string>(LAST_KEY).catch(() => null) : null
  if (last === body) return finish({ ...stats, status: 'skipped', reason: 'already sent' })

  const ok = await sendEmail({
    to: scoutEmail(),
    subject: `BSKY reply drafts — ${drafts.length} candidates`,
    html: emailLayout({
      heading: 'Bluesky reply drafts',
      reason: 'Reply drafts found by the twice-weekly scout — post each one yourself from the quoted thread.',
      body
    })
  })
  if (!ok) return finish({ ...stats, status: 'failed', reason: 'email send failed' })

  if (kv) {
    await kv.sadd(SEEN_KEY, ...(drafts.map((d) => d.post.uri) as [string, ...string[]])).catch(() => {})
    await kv.expire(SEEN_KEY, SEEN_TTL).catch(() => {})
    await kv.set(LAST_KEY, body, { ex: LAST_TTL }).catch(() => {})
  }
  return finish({ ...stats, status: 'emailed' })
}
