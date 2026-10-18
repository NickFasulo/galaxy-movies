import webpush from 'web-push'
import { SITE_URL } from '../../lib/site'
import type { MatchedItem } from './watchlistAlerts'

export interface StoredPushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
  createdAt?: number
}

export const MAX_PUSH_SUBS = 5

// Only real push-service origins — anything else is a stored-SSRF hole, since
// the cron POSTs to every endpoint it finds. Suffixes cover vendor subdomains
// (web.push.apple.com, wns2-*.notify.windows.com, autopush stages).
const PUSH_HOSTS = new Set(['fcm.googleapis.com'])
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com']

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 1024) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const host = url.hostname
    return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s))
  } catch {
    return false
  }
}

export function parsePushSubscription(input: unknown): StoredPushSub | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input as Record<string, unknown>
  if (!isPushEndpoint(endpoint)) return null
  if (!keys || typeof keys !== 'object') return null
  const { p256dh, auth } = keys as Record<string, unknown>
  if (typeof p256dh !== 'string' || !p256dh || p256dh.length > 200) return null
  if (typeof auth !== 'string' || !auth || auth.length > 100) return null
  return { endpoint, keys: { p256dh, auth } }
}

// Validates each entry (they were checked at write time; this guards
// hand-edited/corrupt values) and preserves the stored createdAt.
export function parseStoredSubs(input: unknown): StoredPushSub[] {
  if (!Array.isArray(input)) return []
  const out: StoredPushSub[] = []
  for (const raw of input) {
    const sub = parsePushSubscription(raw)
    if (!sub) continue
    const createdAt = (raw as Record<string, unknown>).createdAt
    out.push({ ...sub, createdAt: typeof createdAt === 'number' ? createdAt : undefined })
    if (out.length >= MAX_PUSH_SUBS) break
  }
  return out
}

export function mergePushSub(subs: StoredPushSub[], sub: StoredPushSub): StoredPushSub[] {
  const rest = subs.filter((s) => s.endpoint !== sub.endpoint)
  rest.push({ ...sub, createdAt: Date.now() })
  return rest.slice(-MAX_PUSH_SUBS)
}

let vapidReady: boolean | null = null
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady
  const pub = process.env.NEXT_PUBLIC_WEBPUSH_PUBLIC_KEY
  const priv = process.env.WEBPUSH_PRIVATE_KEY
  vapidReady = Boolean(pub && priv)
  if (vapidReady) {
    webpush.setVapidDetails(process.env.WEBPUSH_SUBJECT || SITE_URL, pub!, priv!)
  }
  return vapidReady
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (stamp: string | null | undefined) => {
  const m = String(stamp || '').match(/^(\d{4})-?(\d{2})-?(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : ''
}

// Plain text — notification bodies render no markup.
function statusLine(item: MatchedItem): string {
  switch (item.kind) {
    case 'coming':
      return `Coming to ${item.provider}${item.date ? `, ${prettyDate(item.date)}` : ''}${item.season ? `, season ${item.season}` : ''}`
    case 'leaving':
      return `Leaving ${item.provider} soon`
    case 'episode':
      return `New episode${item.season != null && item.episode != null ? ` S${item.season}E${item.episode}` : ''} airs ${prettyDate(item.date) || 'soon'}`
    case 'taste':
      return `Now on ${item.provider} — because you rated ${item.via || ''} highly`
    default:
      return `Now on ${item.provider}`
  }
}

export function buildPushPayload(items: MatchedItem[]) {
  const lines = items.slice(0, 4).map((item) => `${item.title} — ${statusLine(item)}`)
  const more = items.length - lines.length
  if (more > 0) lines.push(`…and ${more} more`)
  return {
    title: 'Something on your list just moved',
    body: lines.join('\n'),
    url: '/watchlist'
  }
}

// Returns which endpoints are dead (404/410) so the caller can prune them —
// push subscriptions expire silently and accumulate otherwise.
export async function sendPushAlert(subs: StoredPushSub[], items: MatchedItem[]): Promise<{ ok: boolean; dead: string[] }> {
  if (!ensureVapid() || !subs.length) return { ok: false, dead: [] }
  const payload = JSON.stringify(buildPushPayload(items))
  const dead: string[] = []
  let ok = false
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 60 * 60 * 24 }
      )
      ok = true
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        dead.push(sub.endpoint)
      } else {
        console.error(`Push send failed (${status ?? 'network'}):`, err)
      }
    }
  }
  return { ok, dead }
}
