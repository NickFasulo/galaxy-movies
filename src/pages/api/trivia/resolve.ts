import type { NextApiRequest, NextApiResponse } from 'next'
import { providerLabel, resolveWeeklySlate } from '../../../features/game/questions'
import { checkPublicDigestLimit } from '../../../lib/rateLimiter'

// Resolves a weekly prediction slate against the real departures that landed
// during that week. Called by the Devvit app's Sunday resolution job.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await checkPublicDigestLimit(req))) return res.status(429).json({ error: 'Rate limit reached' })

  const week = typeof req.query.week === 'string' ? req.query.week : ''
  if (!/^\d{4}-W\d{1,2}$/.test(week)) return res.status(400).json({ error: 'week=YYYY-Wnn required' })

  try {
    const result = await resolveWeeklySlate(week)
    if (!result) return res.status(404).json({ error: 'unknown week' })
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({ ...result, providerLabel: providerLabel(result.provider) })
  } catch (err) {
    console.error('trivia/resolve failed:', err)
    return res.status(500).json({ error: 'resolve failed' })
  }
}
