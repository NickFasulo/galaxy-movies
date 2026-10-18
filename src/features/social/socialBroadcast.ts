import { getRedis } from '../../lib/redis'
import { getProviderChanges } from '../catalog/streamingChanges'
import { PROVIDER_NAME_MATCH } from '../catalog/tmdb'
import { SOCIAL_CHANNELS } from './socialChannels'
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
const providerLabel = (key: string) => PROVIDER_LABELS[key] || key

export const BROADCAST_LINK = `${SITE_URL}/leaving`

export function buildBroadcastPost(
  changes: Record<string, { added: { title: string }[]; left: { title: string }[]; coming: { title: string }[] }>,
  maxLen = 300
): string {
  const lines: string[] = [`This week's streaming moves:`]
  const adds: string[] = []
  const leaves: string[] = []

  for (const key of BROADCAST_PROVIDERS) {
    const change = changes[key]
    if (!change) continue
    for (const t of change.added.slice(0, 2)) adds.push(`+ ${t.title} → ${providerLabel(key)}`)
    for (const t of change.left.slice(0, 2)) leaves.push(`− ${t.title} ← ${providerLabel(key)}`)
  }

  lines.push(...adds.slice(0, 4), ...leaves.slice(0, 3))
  let text = `${lines.join('\n')}\n\nFull lists updated daily: ${BROADCAST_LINK}`

  // Drop lines from the end until the post fits the channel's cap.
  while (text.length > maxLen && lines.length > 1) {
    lines.pop()
    text = `${lines.join('\n')}\n\nFull lists updated daily: ${BROADCAST_LINK}`
  }
  return text
}

// Per-channel dedupe: `gm:social:last-post:{channel}` stores the last text
// posted through it, so a partial failure retries only the channels that
// missed the post instead of spamming the ones that didn't.
const lastPostKey = (channel: string) => `gm:social:last-post:${channel}`

export interface ChannelResult {
  status: 'posted' | 'skipped' | 'failed'
  reason?: string
}

export async function broadcastWeeklyDigest(): Promise<Record<string, ChannelResult>> {
  const changes = await getProviderChanges(BROADCAST_PROVIDERS)
  if (!Object.keys(changes).length) return { bsky: { status: 'failed', reason: 'no changes data' } }

  const kv = getRedis()
  const results: Record<string, ChannelResult> = {}

  for (const channel of SOCIAL_CHANNELS) {
    if (!channel.ready()) {
      results[channel.name] = { status: 'skipped', reason: 'not configured' }
      continue
    }

    const text = buildBroadcastPost(changes, channel.maxLen)
    if (text.length < 40) {
      results[channel.name] = { status: 'skipped', reason: 'nothing to post' }
      continue
    }

    const last = kv ? await kv.get<string>(lastPostKey(channel.name)).catch(() => null) : null
    if (last === text) {
      results[channel.name] = { status: 'skipped', reason: 'already posted' }
      continue
    }

    const failure = await channel.post(text, BROADCAST_LINK)
    if (failure) {
      results[channel.name] = { status: 'failed', reason: failure }
      continue
    }
    await kv?.set(lastPostKey(channel.name), text, { ex: 60 * 60 * 24 * 8 }).catch(() => {})
    results[channel.name] = { status: 'posted' }
  }

  return results
}
