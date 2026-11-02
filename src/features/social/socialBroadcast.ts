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
  maxLen = 300
): string {
  const lines: string[] = [`This week's streaming moves:`]

  // One line per provider — "+ added, − left" reads cleanly and spends fewer
  // characters than repeating the service name on every title.
  for (const key of BROADCAST_PROVIDERS) {
    const change = changes[key]
    if (!change) continue
    const parts = [
      ...change.added.slice(0, 2).map((t) => `+ ${t.title}`),
      ...change.left.slice(0, 2).map((t) => `− ${t.title}`)
    ]
    if (parts.length) lines.push(`${providerLabel(key)}: ${parts.join(' ')}`)
  }

  let text = `${lines.join('\n')}\n\nFull lists updated daily: ${BROADCAST_LINK}`

  // Drop lines from the end until the post fits the channel's cap.
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    text = `${lines.join('\n')}\n\nFull lists updated daily: ${BROADCAST_LINK}`
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
  headline = "This week's streaming moves:"
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

  const footer = `Full lists updated daily: ${BROADCAST_LINK}`
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
  maxLen = 10000
): string {
  if (!providerKeys.some((key) => changes[key]?.leavingSoon?.length)) return ''
  const onlyLeaving = Object.fromEntries(
    providerKeys.map((key) => [key, { added: [], left: [], coming: [], leavingSoon: changes[key]?.leavingSoon || [] }])
  )
  return buildRedditDigest(onlyLeaving, providerKeys, maxLen, 'Leaving soon on streaming:')
}

// Per-channel dedupe: `gm:social:last-post:{channel}` stores the last text
// posted through it, so a partial failure retries only the channels that
// missed the post instead of spamming the ones that didn't. `scope` separates
// the broadcast types (weekly vs monthly) so one's dedupe can't suppress or
// resurrect the other's posts.
const lastPostKey = (channel: string, scope?: string) =>
  `gm:social:last-post:${scope ? `${scope}:` : ''}${channel}`

export interface ChannelResult {
  status: 'posted' | 'skipped' | 'failed'
  reason?: string
}

async function broadcastToChannels(
  textFor: (channel: SocialChannel) => { text: string; title?: string },
  opts: { scope?: string; ttlDays: number }
): Promise<Record<string, ChannelResult>> {
  const kv = getRedis()
  const results: Record<string, ChannelResult> = {}

  for (const channel of SOCIAL_CHANNELS) {
    if (!channel.ready()) {
      results[channel.name] = { status: 'skipped', reason: 'not configured' }
      continue
    }

    const { text, title } = textFor(channel)
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

    const failure = await channel.post(text, BROADCAST_LINK, title)
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
    (channel) =>
      channel.format === 'markdown'
        ? {
            text: buildRedditDigest(changes, BROADCAST_PROVIDERS, channel.maxLen),
            title: "This week's streaming moves: new arrivals & departures"
          }
        : { text: buildBroadcastPost(changes, channel.maxLen) },
    { ttlDays: 8 }
  )
}

// Month-end post: the dated departures Watchmode's leavingSoon says are about
// to disappear. Runs on the 25th so subscribers get a few days' warning.
export function buildDeparturesPost(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null }[] }>,
  maxLen = 300
): string {
  const lines: string[] = [`Leaving soon on streaming:`]
  for (const key of BROADCAST_PROVIDERS) {
    for (const t of changes[key]?.leavingSoon?.slice(0, 3) || []) {
      lines.push(`− ${t.title}${t.date ? ` (${digestDate(t.date)})` : ''} ← ${providerLabel(key)}`)
    }
  }
  if (lines.length === 1) return ''

  let text = `${lines.join('\n')}\n\nFull lists updated daily: ${BROADCAST_LINK}`
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    text = `${lines.join('\n')}\n\nFull lists updated daily: ${BROADCAST_LINK}`
  }
  return text
}

// Churn-first variant: the month's net adds/losses per service is the headline,
// dated departures trail it. Links the report page — the stat table is the
// shareable asset, the leaving list is context.
export function buildMonthlyChurnPost(
  changes: Record<string, { leavingSoon?: { title: string; date?: string | null }[] }>,
  monthly: Record<string, MonthlyChanges | null | undefined>,
  maxLen = 300
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
      leavingLines.push(`− ${t.title}${t.date ? ` (${digestDate(t.date)})` : ''} ← ${providerLabel(key)}`)
    }
  }

  const lines = [`Streaming in ${monthLabel}:`, ...churnLines.slice(0, 6)]
  if (leavingLines.length) lines.push('', 'Leaving soon:', ...leavingLines.slice(0, 3))
  if (lines.length === 1) return ''

  const footer = `Full report: ${SITE_URL}/reports/streaming-churn`
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
    (channel) =>
      channel.format === 'markdown'
        ? {
            text: buildDeparturesDigest(changes, BROADCAST_PROVIDERS, channel.maxLen),
            title: "Leaving soon on streaming: this month's departures"
          }
        : { text: buildMonthlyChurnPost(changes, monthly, channel.maxLen) || buildDeparturesPost(changes, channel.maxLen) },
    { scope: 'monthly', ttlDays: 35 }
  )
}
