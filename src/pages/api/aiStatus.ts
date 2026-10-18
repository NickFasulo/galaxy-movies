import type { NextApiRequest, NextApiResponse } from 'next'
import { isAiAvailable } from '../../features/ai/openai'
import { requireMethod, setApiCache } from '../../lib/api'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  setApiCache(res, 300, 3600, { cdn: true })
  return res.status(200).json({ available: await isAiAvailable() })
}
