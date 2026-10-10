import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getClientIP, checkDistributedRateLimit } from '../../../utils/rateLimiter'
import { getLinkedEmail } from '../../../utils/billing'
import { polarConfigured, polarPost, productForPlan, PLUS_SUCCESS_URL } from '../../../utils/polar'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return
  if (!polarConfigured()) {
    return res.status(503).json({ error: 'Billing is not available yet.' })
  }

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'billing_rl',
    maxRequests: 10,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) {
    return res.status(403).json({ error: 'Link this device to your alerts account first.' })
  }

  const product = productForPlan(req.body?.plan)
  if (!product) {
    return res.status(503).json({ error: 'Billing is not configured.' })
  }

  const checkout = await polarPost<{ url?: string }>('/v1/checkouts/', {
    products: [product],
    customer_email: email,
    success_url: PLUS_SUCCESS_URL,
    metadata: { email, plan: req.body?.plan === 'yearly' ? 'yearly' : 'monthly' }
  })
  if (!checkout?.url) {
    return res.status(502).json({ error: 'Could not start checkout. Please try again.' })
  }
  return res.status(200).json({ url: checkout.url })
}
