import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getBillingRecord, getLinkedEmail } from '../../../utils/billing'
import { polarConfigured, polarPost } from '../../../utils/polar'

// The sync key is the auth — a valid one only ever comes through email, so a
// leaked portal URL can't be minted without access to the inbox.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  if (rejectBot(req, res)) return

  const fallback = () => res.redirect(302, '/plus')

  if (!polarConfigured()) return fallback()

  const email = await getLinkedEmail(req)
  if (!email) return fallback()

  const record = await getBillingRecord(email)
  if (!record?.customerId) return fallback()

  const session = await polarPost<{ customer_portal_url?: string }>('/v1/customer-sessions/', {
    customer_id: record.customerId
  })
  if (!session?.customer_portal_url) return fallback()

  return res.redirect(302, session.customer_portal_url)
}
