import type { NextApiRequest, NextApiResponse } from 'next'
import { broadcastCustomPost } from '../../../features/social/socialBroadcast'
import { engagementPromptForWeek } from '../../../features/social/engagementPrompts'
import { stashAdhocPost } from '../../../features/social/adhocPost'
import { isCronAuthorized } from '../../../lib/auth'

export const config = { maxDuration: 60 }

// Weekly engagement prompt — rotates ENGAGEMENT_PROMPTS by ISO week and
// broadcasts to every configured channel. Reddit goes through the Devvit
// stash (adhocPost) like manual /api/cron/social-post calls.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // No method check — the worker's scheduled() dispatch is a GET (same
  // convention as social-broadcast; the POST-only check 405'd this cron).
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const prompt = engagementPromptForWeek()
  try {
    const summary = await broadcastCustomPost(
      {
        x: prompt.x,
        bsky: prompt.bsky,
        mastodon: prompt.bsky,
        telegram: prompt.long,
        discord: prompt.long,
        facebook: prompt.long,
      },
      undefined,
      prompt.link
    )
    await stashAdhocPost(prompt.long, { title: prompt.title, url: prompt.link })
    return res.status(200).json({ prompt: prompt.title, ...summary })
  } catch (err) {
    console.error('Social engagement failed:', err)
    return res.status(500).json({ error: 'Post failed' })
  }
}
