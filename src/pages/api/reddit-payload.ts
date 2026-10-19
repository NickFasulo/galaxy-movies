import type { NextApiRequest, NextApiResponse } from 'next'
import { getProviderChanges } from '../../features/catalog/streamingChanges'
import { BROADCAST_LINK, BROADCAST_PROVIDERS, buildBroadcastPost } from '../../features/social/socialBroadcast'
import { checkPublicDigestLimit } from '../../lib/rateLimiter'

// Public read-only payload the r/galaxymovies Devvit app polls on its weekly
// schedule. Contains only already-public digest content; `key` lets the caller
// dedupe without comparing bodies. Rate-limited but no UA check — the Devvit
// fetcher isn't a browser.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await checkPublicDigestLimit(req))) {
    return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
  }

  try {
    const changes = await getProviderChanges(BROADCAST_PROVIDERS)
    if (!Object.keys(changes).length) return res.status(503).json({ error: 'no changes data' })

    const text = buildBroadcastPost(changes, 10000)
    if (text.length < 40) return res.status(503).json({ error: 'nothing to post' })

    const now = new Date()
    const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)

    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({
      title: "This week's streaming moves: new arrivals & departures",
      text,
      url: BROADCAST_LINK,
      key: `${now.getUTCFullYear()}-W${week}`
    })
  } catch (err) {
    console.error('reddit-payload failed:', err)
    return res.status(500).json({ error: 'payload failed' })
  }
}
