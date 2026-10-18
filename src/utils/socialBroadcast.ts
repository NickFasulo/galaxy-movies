import { getRedis } from './redis'
import { getProviderChanges } from './streamingChanges'
import { PROVIDER_NAME_MATCH } from './tmdb'
import { SITE_URL } from './site'

// Highlights for the weekly social post: the biggest-name services, in the
// order readers care about them.
const BROADCAST_PROVIDERS = ['netflix', 'hulu', 'max', 'disney-plus', 'amazon-prime-video', 'apple-tv'].filter(
  (key) => PROVIDER_NAME_MATCH[key]
)

const providerLabel = (key: string) => key === 'apple-tv' ? 'Apple TV+' : key === 'disney-plus' ? 'Disney+' : key === 'amazon-prime-video' ? 'Prime Video' : key === 'max' ? 'Max' : key === 'netflix' ? 'Netflix' : key === 'hulu' ? 'Hulu' : key

export function buildBroadcastPost(changes: Record<string, { added: { title: string }[]; left: { title: string }[]; coming: { title: string }[] }>): string {
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
  const link = `${SITE_URL.replace('https://www.', 'https://')}/leaving`
  let text = `${lines.join('\n')}\n\nFull lists updated daily: ${link}`

  // 300 graphemes is the Bluesky cap — trim the leaf lines until it fits.
  while (text.length > 300 && lines.length > 1) {
    lines.pop()
    text = `${lines.join('\n')}\n\nFull lists updated daily: ${link}`
  }
  return text
}

interface BskySession {
  accessJwt: string
  did: string
}

async function bskyLogin(): Promise<BskySession | null> {
  const resp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: process.env.BSKY_HANDLE, password: process.env.BSKY_APP_PASSWORD })
  }).catch(() => null)
  if (!resp?.ok) return null
  const data = await resp.json().catch(() => null)
  return data?.accessJwt && data?.did ? { accessJwt: data.accessJwt, did: data.did } : null
}

// Facets are what make the URL clickable — they index UTF-8 bytes, not chars.
function linkFacets(text: string) {
  const urlRe = /https?:\/\/[^\s]+/g
  const facets = []
  let m
  while ((m = urlRe.exec(text))) {
    const start = new TextEncoder().encode(text.slice(0, m.index)).length
    const end = start + new TextEncoder().encode(m[0]).length
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }]
    })
  }
  return facets
}

export async function broadcastWeeklyDigest(): Promise<{ posted: boolean; reason?: string; chars?: number }> {
  if (!process.env.BSKY_HANDLE || !process.env.BSKY_APP_PASSWORD) {
    return { posted: false, reason: 'BSKY_* env not set' }
  }

  const changes = await getProviderChanges(BROADCAST_PROVIDERS)
  const text = buildBroadcastPost(changes)
  if (!text || text.length < 40) return { posted: false, reason: 'nothing to post' }

  const kv = getRedis()
  const textKey = `gm:social:last-post`
  if (kv) {
    const last = await kv.get<string>(textKey).catch(() => null)
    if (last === text) return { posted: false, reason: 'already posted this content' }
  }

  const session = await bskyLogin()
  if (!session) return { posted: false, reason: 'bsky login failed' }

  const resp = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessJwt}` },
    body: JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        facets: linkFacets(text),
        createdAt: new Date().toISOString()
      }
    })
  }).catch(() => null)

  if (!resp?.ok) return { posted: false, reason: `post failed: ${resp?.status}` }
  await kv?.set(textKey, text, { ex: 60 * 60 * 24 * 8 }).catch(() => {})
  return { posted: true, chars: text.length }
}
