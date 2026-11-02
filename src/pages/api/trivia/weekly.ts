import type { NextApiRequest, NextApiResponse } from 'next'
import { buildSlateText, getWeeklySlate, providerLabel } from '../../../features/game/questions'
import { checkPublicDigestLimit } from '../../../lib/rateLimiter'
import { SITE_URL } from '../../../lib/site'

// Public read-only weekly prediction slate for the Still Streaming? Devvit app.
// Ships the same {title, text, url, key} contract as /api/reddit-payload so
// the app posts it with identical formatting; raw slate fields stay for
// clients that render their own.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await checkPublicDigestLimit(req))) return res.status(429).json({ error: 'Rate limit reached' })

  try {
    const slate = await getWeeklySlate()
    if (!slate) return res.status(503).json({ error: 'no slate data' })
    const label = providerLabel(slate.provider)
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({
      ...slate,
      providerLabel: label,
      title: `Still Streaming? Which ${label} titles leave this week?`,
      text: buildSlateText(slate),
      url: `${SITE_URL}/leaving/${slate.provider}`,
      key: `${slate.week}:slate:${slate.provider}`
    })
  } catch (err) {
    console.error('trivia/weekly failed:', err)
    return res.status(500).json({ error: 'payload failed' })
  }
}
