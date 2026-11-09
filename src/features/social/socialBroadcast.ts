import { getRedis } from '../../lib/redis'
import { getMonthlyChanges, getProviderChanges, type MonthlyChanges } from '../catalog/streamingChanges'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../catalog/tmdb'
import { SOCIAL_CHANNELS, type SocialChannel } from './socialChannels'
import { SITE_URL } from '../../lib/site'

// Highlights for the weekly social post: the biggest-name services, in the
// order readers care about them.
export const BROADCAST_PROVIDERS = ['netflix', 'hulu', 'max', 'disney-plus', 'amazon-prime-video', 'apple-tv'].filter(
  (key) => PROVIDER_NAME_MATCH[key]
)

const PROVIDER_LABELS: Record<string, string> = {
  'apple-tv': 'Apple TV+',
  'disney-plus': 'Disney+',
  'amazon-prime-video': 'Prime Video',
  max: 'Max',
  netflix: 'Netflix',
  hulu: 'Hulu'
}
export const providerLabel = (key: string) =>
  PROVIDER_LABELS[key] || streamingProviders[key]?.title.replace(/ Movies$/, '') || key

export const BROADCAST_LINK = `${SITE_URL}/leaving`

export function buildBroadcastPost(
  changes: Record<string, { added: { title: string }[]; left: { title: string }[]; coming: { title: string }[] }>,
  maxLen = 300,
  link = BROADCAST_LINK
): string {
  // One block per provider: header line, then one title per line tagged
  // ✅ added / ❌ left. Newlines replace the old spaces 1:1 — the taller
  // scan-friendly layout only costs the blank line between blocks.
  const blocks: string[] = []
  for (const key of BROADCAST_PROVIDERS) {
    const change = changes[key]
    if (!change) continue
    const parts = [
      ...change.added.slice(0, 2).map((t) => `✅ ${t.title}`),
      ...change.left.slice(0, 2).map((t) => `❌ ${t.title}`)
    ]
    if (parts.length) blocks.push(`${providerLabel(key)}:\n${parts.join('\n')}`)
  }

  const render = () => [`This week's streaming moves:`, ...blocks].join('\n\n') + `\n\nFull lists updated daily: ${link}`

  // Drop trailing provider blocks until the post fits the channel's cap.
  let text = render()
  while (text.length > maxLen && blocks.length) {
    blocks.pop()
    text = render()
  }
  return text
}

const digestDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// Fuller markdown digest for subreddit posts (the /api/reddit-payload Devvit
// app): per-provider sections with dated coming/leaving rows, unlike the terse
// single-line format social channels need.
export function buildRedditDigest(
  changes: Record<
    string,
    {
      added: { title: string }[]
      left: { title: string }[]
      coming: { title: string; date?: string | null }[]
      leavingSoon?: { title: string; date?: string | null }[]
    }
  >,
  providerKeys: string[],
  maxLen = 10000,
  headline = "This week's streaming moves:",
  link = BROADCAST_LINK
): string {
  const join = (titles: { title: string; date?: string | null }[], cap: number, dated: boolean) =>
    titles
      .slice(0, cap)
      .map((t) => (dated && t.date ? `${t.title} (${digestDate(t.date)})` : t.title))
      .join(', ')

  const lines: string[] = [headline]
  for (const key of providerKeys) {
    const change = changes[key]
    if (!change) continue
    const section: string[] = []
    if (change.added.length) section.push(`- Added: ${join(change.added, 8, false)}`)
    if (change.left.length) section.push(`- Removed: ${join(change.left, 8, false)}`)
    if (change.leavingSoon?.length) section.push(`- Leaving soon: ${join(change.leavingSoon, 6, true)}`)
    if (change.coming.length) section.push(`- Coming soon: ${join(change.coming, 6, true)}`)
    if (section.length) lines.push('', `**${providerLabel(key)}**`, ...section)
  }

  const footer = `Full lists updated daily: ${link}`
  let text = `${lines.join('\n')}\n\n${footer}`
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    // Don't leave an orphaned provider header as the last content line.
    while (lines.length > 1 && lines[lines.length - 1].startsWith('**')) lines.pop()
    text = `${lines.join('\n')}\n\n${footer}`
  }
  return text
}

// Departures-only variant for the Devvit monthly task (/api/reddit-payload
// ?kind=leaving): same per-provider markdown layout, restricted to dated
// leavingSoon rows. Empty so quiet months produce 'nothing to post'.
export function buildDeparturesDigest(
  changes: Record<
    string,
    {
      added?: { title: string }[]
      left?: { title: string }[]
      coming?: { title: string; date?: string | null }[]
      leavingSoon?: { title: string; date?: string | null }[]
    }
  >,
  providerKeys: string[],
  maxLen = 10000,
  link = BROADCAST_LINK
): string {
  if (!providerKeys.some((key) => changes[key]?.leavingSoon?.length)) return ''
  const onlyLeaving = Object.fromEntries(
    providerKeys.map((key) => [key, { added: [], left: [], coming: [], leavingSoon: changes[key]?.leavingSoon || [] }])
  )
  return buildRedditDigest(onlyLeaving, providerKeys, maxLen, 'Leaving soon on streaming:', link)
}

// Per-channel dedupe: `gm:social:last-post:{channel}` stores the last text
// posted through it, so a partial failure retries only the channels that
// missed the post instead of spamming the ones that didn't. `scope` separates
// the broadcast types (weekly vs monthly) so one's dedupe can't suppress or
// resurrect the other's posts.
const lastPostKey = (channel: string, scope?: string) =>
  `gm:social:last-post:${scope ? `${scope}:` : ''}${channel}`

// Every channel posts a differently-tagged link so Umami can attribute the
// traffic — the tag rides inside the post text too, since that's the URL
// Bluesky/X readers actually click.
const utmLink = (base: string, channel: string, scope?: string) =>
  `${base}${base.includes('?') ? '&' : '?'}utm_source=${channel}&utm_medium=social&utm_campaign=${scope || 'weekly'}`

export interface ChannelResult {
  status: 'posted' | 'skipped' | 'failed'
  reason?: string
}

async function broadcastToChannels(
  textFor: (channel: SocialChannel, tagLink: (base: string) => string) => {
    text: string
    title?: string
    linkBase?: string
  },
  opts: { scope?: string; ttlDays: number }
): Promise<Record<string, ChannelResult>> {
  const kv = getRedis()
  const results: Record<string, ChannelResult> = {}

  for (const channel of SOCIAL_CHANNELS) {
    if (!channel.ready()) {
      results[channel.name] = { status: 'skipped', reason: 'not configured' }
      continue
    }

    const tagLink = (base: string) => utmLink(base, channel.name, opts.scope)
    const { text, title, linkBase = BROADCAST_LINK } = textFor(channel, tagLink)
    if (text.length < 40) {
      results[channel.name] = { status: 'skipped', reason: 'nothing to post' }
      continue
    }

    const key = lastPostKey(channel.name, opts.scope)
    const last = kv ? await kv.get<string>(key).catch(() => null) : null
    if (last === text) {
      results[channel.name] = { status: 'skipped', reason: 'already posted' }
      continue
    }

    const failure = await channel.post(text, tagLink(linkBase), title)
    if (failure) {
      results[channel.name] = { status: 'failed', reason: failure }
      continue
    }
    await kv?.set(key, text, { ex: 60 * 60 * 24 * opts.ttlDays }).catch(() => {})
    results[channel.name] = { status: 'posted' }
  }

  return results
}

export async function broadcastWeeklyDigest(): Promise<Record<string, ChannelResult>> {
  const changes = await getProviderChanges(BROADCAST_PROVIDERS)
  if (!Object.keys(changes).length) return { bsky: { status: 'failed', reason: 'no changes data' } }
  return broadcastToChannels(
    (channel, tagLink) =>
      channel.format === 'markdown'
        ? {
            text: buildRedditDigest(
              changes,
              BROADCAST_PROVIDERS,
              channel.maxLen,
              "This week's streaming moves:",
              tagLink(BROADCAST_LINK)
            ),
            title: "This week's streaming moves: new arrivals & departures"
          }
        : { text: buildBroadcastPost(changes, channel.maxLen, tagLink(BROADCAST_LINK)) },
    { ttlDays: 8 }
  )
}

// Month-end post: the dated departures Watchmode's leavingSoon says are about
// to disappear. Runs on the 25th so subscribers get a few days' warning.
export function buildDeparturesPost(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null }[] }>,
  maxLen = 300,
  link = BROADCAST_LINK
): string {
  const lines: string[] = [`Leaving soon on streaming:`]
  for (const key of BROADCAST_PROVIDERS) {
    for (const t of changes[key]?.leavingSoon?.slice(0, 3) || []) {
      lines.push(`❌ ${t.title}${t.date ? ` (${digestDate(t.date)})` : ''} — ${providerLabel(key)}`)
    }
  }
  if (lines.length === 1) return ''

  let text = `${lines.join('\n')}\n\nFull lists updated daily: ${link}`
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    text = `${lines.join('\n')}\n\nFull lists updated daily: ${link}`
  }
  return text
}

// Churn-first variant: the month's net adds/losses per service is the headline,
// dated departures trail it. Links the report page — the stat table is the
// shareable asset, the leaving list is context.
function buildMonthlyChurnPost(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null }[] }>,
  monthly: Record<string, MonthlyChanges | null | undefined>,
  maxLen = 300,
  link = `${SITE_URL}/reports/streaming-churn`
): string {
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long' })
  const churnLines = BROADCAST_PROVIDERS
    .map((key) => {
      const m = monthly[key]
      if (!m || (!m.arrived.length && !m.departed.length)) return null
      const net = m.arrived.length - m.departed.length
      return `${providerLabel(key)}: ${m.arrived.length} added, ${m.departed.length} left${net !== 0 ? ` (net ${net > 0 ? '+' : ''}${net})` : ''}`
    })
    .filter((l): l is string => Boolean(l))

  const leavingLines: string[] = []
  for (const key of BROADCAST_PROVIDERS) {
    for (const t of changes[key]?.leavingSoon?.slice(0, 2) || []) {
      leavingLines.push(`❌ ${t.title}${t.date ? ` (${digestDate(t.date)})` : ''} — ${providerLabel(key)}`)
    }
  }

  const lines = [`Streaming in ${monthLabel}:`, ...churnLines.slice(0, 6)]
  if (leavingLines.length) lines.push('', 'Leaving soon:', ...leavingLines.slice(0, 3))
  if (lines.length === 1) return ''

  const footer = `Full report: ${link}`
  let text = `${lines.join('\n')}\n\n${footer}`
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    while (lines.length > 1 && (lines[lines.length - 1] === '' || lines[lines.length - 1] === 'Leaving soon:')) lines.pop()
    text = `${lines.join('\n')}\n\n${footer}`
  }
  return text
}

export async function broadcastMonthlyDepartures(): Promise<Record<string, ChannelResult>> {
  const [changes, monthly] = await Promise.all([
    getProviderChanges(BROADCAST_PROVIDERS),
    getMonthlyChanges(BROADCAST_PROVIDERS)
  ])
  if (!Object.keys(changes).length && !Object.keys(monthly).length) {
    return { bsky: { status: 'failed', reason: 'no changes data' } }
  }
  return broadcastToChannels(
    (channel, tagLink) =>
      channel.format === 'markdown'
        ? {
            text: buildDeparturesDigest(changes, BROADCAST_PROVIDERS, channel.maxLen, tagLink(BROADCAST_LINK)),
            title: "Leaving soon on streaming: this month's departures"
          }
        : {
            text:
              buildMonthlyChurnPost(
                changes,
                monthly,
                channel.maxLen,
                tagLink(`${SITE_URL}/reports/streaming-churn`)
              ) || buildDeparturesPost(changes, channel.maxLen, tagLink(BROADCAST_LINK))
          },
    { scope: 'monthly', ttlDays: 35 }
  )
}

// ---------- Last chance ----------
// Day-level urgency companion to the monthly roundup: Watchmode's dated
// departures landing inside LAST_CHANCE_DAYS. Runs daily — the free-tier
// leaving feed is small, so most runs find nothing and skip on the
// empty-text guard. Departure dates cluster at month-end, which is when this
// fires hardest.

const LAST_CHANCE_DAYS = 2

interface LastChanceRow {
  title: string
  provider: string
  date: string
  popularity: number
}

const isoDay = (d: Date) => d.toISOString().split('T')[0]

const inWindow = (date: string | null | undefined, today: string, cutoff: string): date is string =>
  Boolean(date && date >= today && date <= cutoff)

function lastChanceRows(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null; popularity?: number }[] }>,
  now: Date
): LastChanceRow[] {
  const today = isoDay(now)
  const cutoff = isoDay(new Date(now.getTime() + LAST_CHANCE_DAYS * 86400000))
  const rows: LastChanceRow[] = []
  for (const key of BROADCAST_PROVIDERS) {
    for (const t of changes[key]?.leavingSoon || []) {
      if (!inWindow(t.date, today, cutoff)) continue
      rows.push({ title: t.title, provider: key, date: t.date, popularity: t.popularity ?? 0 })
    }
  }
  // Soonest first; same-day ties fall to the more recognizable title.
  return rows.sort((a, b) => a.date.localeCompare(b.date) || b.popularity - a.popularity)
}

const relDay = (date: string, now: Date) =>
  date === isoDay(now)
    ? 'today'
    : date === isoDay(new Date(now.getTime() + 86400000))
      ? 'tomorrow'
      : digestDate(date)

export function buildLastChancePost(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null; popularity?: number }[] }>,
  maxLen = 300,
  link = BROADCAST_LINK,
  now = new Date()
): string {
  const rows = lastChanceRows(changes, now)
  if (!rows.length) return ''

  const lines = [`Last chance to stream:`]
  for (const r of rows.slice(0, 5)) {
    lines.push(`❌ ${r.title} — ${providerLabel(r.provider)} (${relDay(r.date, now)})`)
  }

  let text = `${lines.join('\n')}\n\nFull lists updated daily: ${link}`
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    text = `${lines.join('\n')}\n\nFull lists updated daily: ${link}`
  }
  return text
}

// Reddit variant: same windowed filter, fuller per-provider markdown layout.
export function buildLastChanceDigest(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null; popularity?: number }[] }>,
  providerKeys: string[],
  maxLen = 10000,
  link = BROADCAST_LINK,
  now = new Date()
): string {
  const today = isoDay(now)
  const cutoff = isoDay(new Date(now.getTime() + LAST_CHANCE_DAYS * 86400000))
  const onlyLeaving = Object.fromEntries(
    providerKeys.map((key) => [
      key,
      {
        added: [],
        left: [],
        coming: [],
        leavingSoon: (changes[key]?.leavingSoon || []).filter((t) => inWindow(t.date, today, cutoff))
      }
    ])
  )
  if (!providerKeys.some((key) => onlyLeaving[key].leavingSoon.length)) return ''
  return buildRedditDigest(onlyLeaving, providerKeys, maxLen, 'Last chance to stream — gone within 48 hours:', link)
}

export async function broadcastLastChance(now = new Date()): Promise<Record<string, ChannelResult>> {
  const changes = await getProviderChanges(BROADCAST_PROVIDERS)
  if (!Object.keys(changes).length) return { bsky: { status: 'failed', reason: 'no changes data' } }

  // Single-provider windows deep-link that service's leaving page instead of
  // the index — the post is entirely about it anyway.
  const rows = lastChanceRows(changes, now)
  const linkBase =
    rows.length > 0 && rows.every((r) => r.provider === rows[0].provider)
      ? `${SITE_URL}/leaving/${rows[0].provider}`
      : BROADCAST_LINK

  return broadcastToChannels(
    (channel, tagLink) => {
      const link = tagLink(linkBase)
      return channel.format === 'markdown'
        ? {
            text: buildLastChanceDigest(changes, BROADCAST_PROVIDERS, channel.maxLen, link, now),
            title: 'Last chance to stream: gone within 48 hours',
            linkBase
          }
        : { text: buildLastChancePost(changes, channel.maxLen, link, now), linkBase }
    },
    { scope: 'lastchance', ttlDays: 7 }
  )
}

// ---------- Ad-hoc ----------
// Caller-supplied copy for one-off posts (/api/cron/social-post) that aren't
// built from diff data — platform updates, engagement prompts. `posts` holds
// per-channel text; `fallback` covers channels without an entry. Text goes
// out as given, so the caller bakes UTM tags into any links in the copy;
// `linkBase` still feeds channels that take a separate link field
// (Facebook preview card, Pinterest) and gets tagged per channel.
export function broadcastCustomPost(
  posts: Record<string, string>,
  fallback?: string,
  linkBase = BROADCAST_LINK
): Promise<Record<string, ChannelResult>> {
  return broadcastToChannels((channel) => ({ text: posts[channel.name] || fallback || '', linkBase }), {
    scope: 'adhoc',
    ttlDays: 1
  })
}
