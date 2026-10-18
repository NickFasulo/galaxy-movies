import type { NextApiRequest, NextApiResponse } from 'next'
import { getDailyTrivia } from '../../../features/game/questions'

// Public read-only daily quiz payload for the Still Streaming? Devvit app.
// Deterministic per UTC date so every install sees the same questions.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const trivia = await getDailyTrivia()
    if (!trivia) return res.status(503).json({ error: 'no trivia data' })
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json(trivia)
  } catch (err) {
    console.error('trivia/daily failed:', err)
    return res.status(500).json({ error: 'payload failed' })
  }
}
