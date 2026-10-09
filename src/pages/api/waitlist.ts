import type { NextApiRequest, NextApiResponse } from 'next'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../utils/rateLimiter'
import { requireMethod, rejectBot } from '../../utils/api'
import { getRedis, PENDING_KEY, CONFIRMED_KEY, getOrCreateSyncKey } from '../../utils/waitlistStore'
import { SITE_URL } from '../../utils/site'
import { randomUUID, createHash } from 'crypto'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/

async function sendConfirmationEmail(email: string, token: string): Promise<boolean> {
  const confirmUrl = `${SITE_URL}/api/waitlist-confirm?email=${encodeURIComponent(email)}&token=${token}`
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
      subject: 'Confirm your Galaxy Movies alerts signup',
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2>Confirm your alerts signup</h2>
          <p>You signed up for streaming alerts on Galaxy Movies. Click below to confirm — if you didn't sign up, just ignore this email.</p>
          <p><a href="${confirmUrl}" style="display: inline-block; background: #2b6cb0; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Confirm my email</a></p>
          <p style="color: #888; font-size: 12px;">Or paste this link: ${confirmUrl}</p>
        </div>`
    })
  })
  return resp.ok
}

// Already-confirmed subscribers hitting the form again from a new device need
// a link bearing their sync key so this device's watchlist can start syncing too.
async function sendLinkDeviceEmail(email: string, key: string): Promise<boolean> {
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
      subject: 'Link this device to your Galaxy Movies alerts',
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2>Link this device</h2>
          <p>You're already signed up for streaming alerts. Click below to sync this device's watchlist so we can alert you when a saved title lands on your services.</p>
          <p><a href="${linkUrl}" style="display: inline-block; background: #2b6cb0; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Link this device</a></p>
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
      await sendLinkDeviceEmail(email, key).catch((err) => console.error('Link-device email failed:', err))
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
    const sent = await sendConfirmationEmail(email, token)
    if (!sent) {
      return res.status(502).json({ error: 'Could not send confirmation email. Please try again.' })
    }

    return res.status(200).json({ ok: true, pending: true })
  } catch (err) {
    console.error('Waitlist store error:', err)
    return res.status(500).json({ error: 'Could not save your email. Please try again.' })
  }
}
