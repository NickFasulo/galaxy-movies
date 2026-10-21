import type { NextApiRequest, NextApiResponse } from 'next'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../lib/rateLimiter'
import { requireMethod, rejectBot } from '../../lib/http'
import { getRedis, PENDING_KEY, CONFIRMED_KEY, getOrCreateSyncKey } from '../../features/alerts/waitlistStore'
import { emailCta, emailLayout, sendEmail } from '../../lib/email'
import { SITE_URL } from '../../lib/site'
import { randomUUID, createHash } from 'crypto'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/

async function sendConfirmationEmail(email: string, token: string, next?: string): Promise<boolean> {
  const confirmUrl = `${SITE_URL}/api/waitlist-confirm?email=${encodeURIComponent(email)}&token=${token}${next ? `&next=${next}` : ''}`
  const toPlus = next === 'plus'
  return sendEmail({
    to: email,
    subject: 'Confirm your Galaxy Movies alerts signup',
    html: emailLayout({
      heading: toPlus ? 'Confirm your email' : 'Confirm your alerts signup',
      preheader: toPlus ? 'One click to confirm and pick your plan' : 'One click to start streaming alerts',
      body: `<p style="margin:0; color:#93a0ad; line-height:1.6;">${toPlus
        ? "You're one click from Galaxy Plus — confirm your email and you'll land back on the Plus page to pick a plan. If you didn't sign up, just ignore this email."
        : "You signed up for streaming alerts on Galaxy Movies. Click below to confirm — if you didn't sign up, just ignore this email."}</p>${emailCta(confirmUrl, 'Confirm my email', true)}`,
      reason: 'You received this email because an alerts signup was started with this address.'
    })
  })
}

// Already-confirmed subscribers hitting the form again from a new device need
// a link bearing their sync key so this device's watchlist can start syncing too.
async function sendLinkDeviceEmail(email: string, key: string, next?: string): Promise<boolean> {
  const linkUrl = `${SITE_URL}/api/alerts-link?email=${encodeURIComponent(email)}&key=${key}${next ? `&next=${next}` : ''}`
  const toPlus = next === 'plus'
  return sendEmail({
    to: email,
    subject: 'Link this device to your Galaxy Movies alerts',
    html: emailLayout({
      heading: toPlus ? 'Continue to Galaxy Plus' : 'Link this device',
      preheader: toPlus ? 'Pick up where you left off on Galaxy Plus' : 'Sync this device to your Galaxy Movies alerts',
      body: `<p style="margin:0; color:#93a0ad; line-height:1.6;">${toPlus
        ? "You're already signed up — click below to head back to Galaxy Plus and pick a plan."
        : "You're already signed up for streaming alerts. Click below to sync this device's watchlist so we can alert you when a saved title lands on your services."}</p>${emailCta(linkUrl, toPlus ? 'Continue to Plus' : 'Link this device', true)}`,
      reason: 'You received this email because a device link was requested for this address.'
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

  // Signups from /plus round-trip through the confirm email back to /plus so
  // the user lands already authed on the plan picker — see waitlist-confirm.
  const next = req.body?.purpose === 'login' ? 'plus' : undefined

  const clientId = getClientIP(req)
  const allowed = await checkDistributedRateLimit(clientId, {
    keyPrefix: 'waitlist_rl',
    maxRequests: 5,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  // Per-address and global caps stop the form being used to mail-bomb a victim
  // from many IPs or to flood the pending hash.
  const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 32)
  const [emailOk, globalOk] = await Promise.all([
    checkDistributedRateLimit(emailHash, { keyPrefix: 'waitlist_email_rl', maxRequests: 2, windowSeconds: 60 * 60 * 24 }),
    checkGlobalBudget('waitlist', { maxRequests: 500, windowSeconds: 60 * 60 * 24 })
  ])
  if (!emailOk || !globalOk) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Waitlist is temporarily unavailable.' })
  }

  try {
    // Same response as a fresh signup so the form can't be used to check who is subscribed.
    if (await kv.hget(CONFIRMED_KEY, email)) {
      const key = await getOrCreateSyncKey(kv, email)
      if (!process.env.RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not set — returning alerts sync key directly (dev/local fallback)')
        return res.status(200).json({ ok: true, confirmed: true, devSyncKey: key })
      }
      await sendLinkDeviceEmail(email, key, next).catch((err) => console.error('Link-device email failed:', err))
      return res.status(200).json({ ok: true, pending: true })
    }

    const token = randomUUID()

    // Without RESEND_API_KEY there's no way to verify ownership, so skip the
    // pending step and confirm directly (dev/local fallback).
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — confirming waitlist signup without verification')
      await kv.hset(CONFIRMED_KEY, { [email]: token })
      await kv.hdel(PENDING_KEY, email)
      const key = await getOrCreateSyncKey(kv, email)
      return res.status(200).json({ ok: true, confirmed: true, devSyncKey: key })
    }

    await kv.hset(PENDING_KEY, { [email]: token })
    const sent = await sendConfirmationEmail(email, token, next)
    if (!sent) {
      return res.status(502).json({ error: 'Could not send confirmation email. Please try again.' })
    }

    return res.status(200).json({ ok: true, pending: true })
  } catch (err) {
    console.error('Waitlist store error:', err)
    return res.status(500).json({ error: 'Could not save your email. Please try again.' })
  }
}
