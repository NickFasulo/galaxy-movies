import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/rateLimiter'
import { getBillingRecord, getLinkedEmail, isPlusActive } from '../../../utils/billing'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'billing_status_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) {
    return res.status(403).json({ error: 'Invalid sync credentials' })
  }

  const record = await getBillingRecord(email)
  return res.status(200).json({ entitlement: isPlusActive(record) ? 'plus' : 'free' })
}
