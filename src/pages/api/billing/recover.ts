import type { NextApiRequest, NextApiResponse } from 'next'
import { createHash } from 'crypto'
import { requireMethod, rejectBot } from '../../../utils/api'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../../utils/rateLimiter'
import { getRedis, getOrCreateSyncKey } from '../../../utils/waitlistStore'
import { getBillingRecord } from '../../../utils/billing'
import { SITE_URL } from '../../../utils/site'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/

// Unsubscribe clears the sync key, but a paid subscriber still needs a way
// back in — this sends the same link-device URL, authorized by the billing
// record rather than waitlist state. The response is generic either way so
// the endpoint can't probe which emails hold subscriptions.
async function sendAccessLinkEmail(email: string, key: string): Promise<boolean> {
  const linkUrl = `${SITE_URL}/api/alerts-link?email=${encodeURIComponent(email)}&key=${key}`
  const from = process.env.RESEND_FROM || 'Galaxy Movies <onboarding@resend.dev>'
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Your Galaxy Plus access link',
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2>Your access link</h2>
          <p>Click below to sign in to Galaxy Plus on this device. If you didn't ask for this, just ignore it.</p>
          <p><a href="${linkUrl}" style="display: inline-block; background: #2b6cb0; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Sign in to Galaxy Plus</a></p>
          <p style="color: #888; font-size: 12px;">Or paste this link: ${linkUrl}</p>
        </div>`
    })
  })
  return resp.ok
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
