import { getRedis } from '../../lib/redis'

// Ad-hoc social posts that should also reach Reddit. The Devvit app can't be
// pushed to (no external-auth channel worth trusting), so it pulls instead:
// /api/cron/social-post stashes the latest reddit-bound post here and the
// Devvit adhoc-check scheduler fetches it via /api/reddit-payload?kind=adhoc.
// Keyed on content hash so retries of the same post don't duplicate.
const ADHOC_KEY = 'gm:social:adhoc-post'

export interface AdhocPost {
  title: string
  text: string
  url: string
  key: string
}

// djb2 — deterministic, no crypto import needed on workerd or Node.
function hash32(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export async function stashAdhocPost(
  text: string,
  opts: { title?: string; url?: string; key?: string } = {}
): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  const title = (opts.title || text.split('\n')[0].replace(/:$/, '')).slice(0, 300)
  const post: AdhocPost = {
    title,
    text,
    url: opts.url || 'https://www.galaxymovies.app',
    key: opts.key || `adhoc:${hash32(title + '\n' + text)}`,
  }
  await redis.set(ADHOC_KEY, JSON.stringify(post)).catch(() => {})
}

export async function readAdhocPost(): Promise<AdhocPost | null> {
  const redis = getRedis()
  if (!redis) return null
  const raw = await redis.get(ADHOC_KEY).catch(() => null)
  if (!raw) return null
  const post = typeof raw === 'string' ? (JSON.parse(raw) as AdhocPost) : (raw as AdhocPost)
  return post?.title && post.text && post.key ? post : null
}
