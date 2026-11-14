import { getRedis } from '../../lib/redis'
import { SOCIAL_CHANNELS } from './socialChannels'
import { socialResultKey } from './socialBroadcast'

// Reads the per-channel health records broadcastToChannels/reddit-engage
// write after every run and shapes them for the indexing-report email — the
// channel list comes from SOCIAL_CHANNELS so a new channel is covered
// automatically; 'reddit-engage' posts through its own path.
export interface SocialResultRec {
  status?: string
  scope?: string
  ts?: string
  reason?: string
  lastPosted?: string
}

export interface ChannelHealth {
  channel: string
  tone: 'ok' | 'warn' | 'bad' | 'muted'
  text: string
}

const ago = (ms: number) => {
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'just now'
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function describeChannel(name: string, rec: SocialResultRec | null, now = new Date()): ChannelHealth {
  if (!rec?.ts) return { channel: name, tone: 'muted', text: 'no runs recorded' }
  const when = ago(now.getTime() - Date.parse(rec.ts))
  if (rec.status === 'failed') {
    return { channel: name, tone: 'bad', text: `failed ${when} (${rec.scope || '?'})${rec.reason ? ` — ${rec.reason}` : ''}` }
  }
  if (rec.status === 'posted' || rec.status === 'emailed') {
    return { channel: name, tone: 'ok', text: `${rec.status === 'emailed' ? 'draft emailed' : 'posted'} ${when} (${rec.scope || '?'})` }
  }
  // skipped — which skip reason decides whether it's a problem
  if (rec.reason === 'not configured') return { channel: name, tone: 'muted', text: 'not configured' }
  if (rec.reason === 'scope gated') {
    return rec.lastPosted
      ? { channel: name, tone: 'ok', text: `last posted ${ago(now.getTime() - Date.parse(rec.lastPosted))} — ${rec.scope || 'run'} gated` }
      : { channel: name, tone: 'muted', text: 'scope gated, never posted' }
  }
  return { channel: name, tone: 'warn', text: `skipped ${when} — ${rec.reason || 'no reason'}` }
}

export async function collectSocialHealth(now = new Date()): Promise<ChannelHealth[]> {
  const kv = getRedis()
  const names = [...SOCIAL_CHANNELS.map((c) => c.name), 'reddit-engage']
  const rows: ChannelHealth[] = []
  for (const name of names) {
    const rec = kv
      ? await kv.hgetall<Record<string, string>>(socialResultKey(name)).catch(() => null)
      : null
    rows.push(describeChannel(name, rec, now))
  }
  return rows
}
