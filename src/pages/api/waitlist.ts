import type { NextApiRequest, NextApiResponse } from 'next'
import { isBot, getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../utils/rateLimiter'
import { getRedis, PENDING_KEY, CONFIRMED_KEY } from '../../utils/waitlistStore'
import { randomUUID, createHash } from 'crypto'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/

async function sendConfirmationEmail(email: string, token: string): Promise<boolean> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://galaxymovies.app'
  const confirmUrl = `${siteUrl}/api/waitlist-confirm?email=${encodeURIComponent(email)}&token=${token}`
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
          <p>You asked to be notified when streaming alerts launch on Galaxy Movies. Click below to confirm — if you didn't sign up, just ignore this email.</p>
          <p><a href="${confirmUrl}" style="display: inline-block; background: #2b6cb0; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none;">Confirm my email</a></p>
          <p style="color: #888; font-size: 12px;">Or paste this link: ${confirmUrl}</p>
        </div>`
    })
  })
  return resp.ok
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  if (isBot(req.headers['user-agent'])) {
    return res.status(403).json({ error: 'Bot access denied' })
  }

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
      return res.status(200).json({ ok: true, pending: true })
    }

    const token = randomUUID()

    // Without RESEND_API_KEY there's no way to verify ownership, so skip the
    // pending step and confirm directly (dev/local fallback).
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — confirming waitlist signup without verification')
      await kv.hset(CONFIRMED_KEY, { [email]: token })
      await kv.hdel(PENDING_KEY, email)
      return res.status(200).json({ ok: true, confirmed: true })
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
