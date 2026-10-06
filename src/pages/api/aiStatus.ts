import type { NextApiRequest, NextApiResponse } from 'next'
import { isAiAvailable } from '../../utils/openai'
import { requireMethod, setApiCache } from '../../utils/api'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  setApiCache(res, 60, 300)
  return res.status(200).json({ available: await isAiAvailable() })
}
