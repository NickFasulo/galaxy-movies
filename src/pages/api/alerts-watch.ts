import type { NextApiRequest, NextApiResponse } from 'next'
import { getClientIP, checkDistributedRateLimit, checkGlobalBudget } from '../../lib/rateLimiter'
import { requireMethod, rejectBot } from '../../lib/http'
import { getRedis, WATCH_PENDING_KEY } from '../../features/alerts/waitlistStore'
import { mergeWatchTitles, type WatchTitle } from '../../features/alerts/titleAlerts'
import { emailCta, emailLayout, escapeHtml, sendEmail } from '../../lib/email'
import { SITE_URL } from '../../lib/site'
import { randomUUID, createHash } from 'crypto'

const EMAIL_PATTERN = /^[^\s@<>"'`,;()\\]+@[^\s@<>"'`,;()\\]+\.[^\s@<>"'`,;()\\]+$/

interface WatchPending {
  token: string
  titles: WatchTitle[]
}

async function sendConfirmEmail(email: string, token: string, title: string): Promise<boolean> {
  const confirmUrl = `${SITE_URL}/api/alerts-watch-confirm?email=${encodeURIComponent(email)}&token=${token}`
  return sendEmail({
    to: email,
    subject: `Confirm: get notified when ${title} moves`,
    html: emailLayout({
      heading: 'Confirm your title alert',
      preheader: `Get notified when ${title} moves`,
      body: `<p style="margin:0; color:#a0aec0; line-height:1.6;">You asked Galaxy Movies to email you when <strong style="color:#ffffff;">${escapeHtml(title)}</strong> lands on or leaves a tracked streaming service. Click below to confirm — if you didn't ask for this, just ignore it.</p>${emailCta(confirmUrl, 'Confirm my alert', true)}`,
      reason: 'You received this email because a title alert was started with this address.'
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'POST')) return
  if (rejectBot(req, res)) return

  const email = String(req.body?.email || '').trim().toLowerCase()
  const tmdbId = Number(req.body?.tmdbId)
  const tmdbType = req.body?.tmdbType === 'tv' ? 'tv' : 'movie'
  const title = String(req.body?.title || '').slice(0, 200).trim()
  if (!EMAIL_PATTERN.test(email) || email.length > 254 || !Number.isInteger(tmdbId) || tmdbId <= 0 || !title) {
    return res.status(400).json({ error: 'Valid email and title required' })
  }

  const clientId = getClientIP(req)
  const allowed = await checkDistributedRateLimit(clientId, {
    keyPrefix: 'watch_rl',
    maxRequests: 5,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const emailHash = createHash('sha256').update(email).digest('hex').slice(0, 32)
  const [emailOk, globalOk] = await Promise.all([
    checkDistributedRateLimit(emailHash, { keyPrefix: 'watch_email_rl', maxRequests: 3, windowSeconds: 60 * 60 * 24 }),
    checkGlobalBudget('watch', { maxRequests: 500, windowSeconds: 60 * 60 * 24 })
  ])
  if (!emailOk || !globalOk) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).json({ error: 'Alerts are temporarily unavailable.' })
  }

  const watchTitle: WatchTitle = { tmdbId, tmdbType, title }

  try {
    // Repeated signups before confirming merge into the same pending entry so
    // each new title doesn't invalidate the last email's token.
    const existing = await kv.hget<WatchPending>(WATCH_PENDING_KEY, email)
    const token = existing?.token || randomUUID()
    const titles = mergeWatchTitles(existing?.titles || [], watchTitle)
    await kv.hset(WATCH_PENDING_KEY, { [email]: { token, titles } })

    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — confirming title watch directly (dev/local fallback)')
      const { WATCH_KEY } = await import('../../features/alerts/waitlistStore')
      const current = await kv.hget<{ unsub: string; titles: WatchTitle[] }>(WATCH_KEY, email)
      await kv.hset(WATCH_KEY, {
        [email]: { unsub: current?.unsub || randomUUID(), titles: mergeWatchTitles(current?.titles || [], watchTitle) }
      })
      await kv.hdel(WATCH_PENDING_KEY, email)
      return res.status(200).json({ ok: true, confirmed: true })
    }

    const sent = await sendConfirmEmail(email, token, title)
    if (!sent) {
      return res.status(502).json({ error: 'Could not send confirmation email. Please try again.' })
    }

    return res.status(200).json({ ok: true, pending: true })
  } catch (err) {
    console.error('Title watch store error:', err)
    return res.status(500).json({ error: 'Could not save your alert. Please try again.' })
  }
}
