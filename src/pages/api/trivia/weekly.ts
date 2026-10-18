import type { NextApiRequest, NextApiResponse } from 'next'
import { getWeeklySlate, providerLabel } from '../../../features/game/questions'

// Public read-only weekly prediction slate for the Still Streaming? Devvit app.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const slate = await getWeeklySlate()
    if (!slate) return res.status(503).json({ error: 'no slate data' })
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({ ...slate, providerLabel: providerLabel(slate.provider) })
  } catch (err) {
    console.error('trivia/weekly failed:', err)
    return res.status(500).json({ error: 'payload failed' })
  }
}
