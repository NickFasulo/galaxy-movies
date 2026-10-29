import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash } from 'crypto'
import { requireMethod, rejectBot } from '../../../lib/http'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../../lib/rateLimiter'
import { getRedis, getOrCreateSyncKey } from '../../../features/alerts/waitlistStore'
import { getBillingRecord } from '../../../features/billing/billing'
import { emailCta, emailLayout, sendEmail } from '../../../lib/email'
import { SITE_URL } from '../../../lib/site'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/

// Unsubscribe clears the sync key, but a paid subscriber still needs a way
// back in — this sends the same link-device URL, authorized by the billing
// record rather than waitlist state. The response is generic either way so
// the endpoint can't probe which emails hold subscriptions.
async function sendAccessLinkEmail(email: string, key: string): Promise<boolean> {
  const linkUrl = `${SITE_URL}/api/alerts-link?email=${encodeURIComponent(email)}&key=${key}`
  return sendEmail({
    to: email,
    subject: 'Your Galaxy Plus access link',
    html: emailLayout({
      heading: 'Your access link',
      preheader: 'Sign in to Galaxy Plus on this device',
      body: `<p style="margin:0; color:#4b5563; line-height:1.6;">Click below to sign in to Galaxy Plus on this device. If you didn't ask for this, just ignore it.</p>${emailCta(linkUrl, 'Sign in to Galaxy Plus', true)}`,
      reason: 'You received this email because a Galaxy Plus sign-in link was requested for this address.'
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Valid email address required' })
  }

  // Sends mail, so it gets the same anti-mailbomb scheme as the waitlist form.
  const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 32)
  const [ipOk, emailOk, globalOk] = await Promise.all([
    checkDistributedRateLimit(getClientIP(req), { keyPrefix: 'recover_rl', maxRequests: 5, windowSeconds: 60 * 60 }),
    checkDistributedRateLimit(emailHash, { keyPrefix: 'recover_email_rl', maxRequests: 2, windowSeconds: 60 * 60 * 24 }),
    checkGlobalBudget('billing_recover', { maxRequests: 500, windowSeconds: 60 * 60 * 24 })
  ])
  if (!ipOk || !emailOk || !globalOk) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Service is temporarily unavailable.' })
  }

  try {
    const record = await getBillingRecord(email)
    if (!record) return res.status(200).json({ ok: true })

    const key = await getOrCreateSyncKey(kv, email)
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — returning sync key directly (dev/local fallback)')
      return res.status(200).json({ ok: true, devSyncKey: key })
    }
    await sendAccessLinkEmail(email, key).catch((err) => console.error('Access-link email failed:', err))
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Billing recover error:', err)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
