import type { NextApiRequest, NextApiResponse } from 'next'
import { broadcastCustomPost } from '../../../features/social/socialBroadcast'
import { SOCIAL_CHANNELS } from '../../../features/social/socialChannels'
import { stashAdhocPost } from '../../../features/social/adhocPost'
import { isCronAuthorized } from '../../../lib/auth'

export const config = { maxDuration: 60 }

// Ad-hoc broadcast to every configured social channel. Unlike the diff-driven
// crons, the caller supplies the copy: { posts?: { channel: text }, text?,
// link? } — posts[name] wins per channel, `text` is the shared fallback, and
// `link` (default /leaving) feeds channels with a separate link field.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' })
  }
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {}
  const text = typeof body.text === 'string' ? body.text : undefined
  const posts = typeof body.posts === 'object' && body.posts ? (body.posts as Record<string, unknown>) : {}
  const link = typeof body.link === 'string' ? body.link : undefined
  if (!text && !Object.values(posts).some((t) => typeof t === 'string' && t.trim().length >= 40)) {
    return res.status(400).json({ error: 'need text or posts' })
  }

  // Over-cap copy fails here so the caller sees it in the response instead of
  // a platform API rejection buried in the per-channel results.
  const over = SOCIAL_CHANNELS.filter((c) => {
    const t = typeof posts[c.name] === 'string' ? (posts[c.name] as string) : text || ''
    return t.length > c.maxLen
  }).map((c) => c.name)
  if (over.length) {
    return res.status(400).json({ error: `over length cap: ${over.join(', ')}` })
  }

  try {
    const summary = await broadcastCustomPost(
      Object.fromEntries(Object.entries(posts).filter((e): e is [string, string] => typeof e[1] === 'string')),
      text,
      link
    )
    // Reddit isn't an env-armed channel — the Devvit app owns it. Stash the
    // reddit-bound copy (posts.reddit wins, else the shared text) for its
    // hourly /api/reddit-payload?kind=adhoc pull.
    const redditText = typeof posts.reddit === 'string' ? posts.reddit : text
    if (redditText) {
      await stashAdhocPost(redditText, {
        title: typeof body.title === 'string' ? body.title : undefined,
        url: link,
      })
    }
    return res.status(200).json(summary)
  } catch (err) {
    console.error('Social post failed:', err)
    return res.status(500).json({ error: 'Post failed' })
  }
}
