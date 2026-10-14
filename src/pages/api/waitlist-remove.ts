import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, PENDING_KEY, CONFIRMED_KEY, SYNCKEY_KEY, ALERTS_PREFS_KEY, ALERTS_NOTIFIED_KEY, TRAKT_KEY, DISCORD_KEY, TELEGRAM_KEY, PUSH_KEY, SHARE_KEY, SHARE_LOOKUP_KEY, CHAT_HISTORY_KEY } from '../../utils/waitlistStore'
import { safeEqual } from '../../utils/auth'
import { requireMethod } from '../../utils/api'

const TOKEN_PATTERN = /^[0-9a-f-]{36}$/i

// No bot check or rate limit — mail clients prefetch links; the token is the auth.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const redirect = (status: string) => res.redirect(302, `/email-status?status=${status}`)

  if (!requireMethod(req, res, 'GET')) return

  const email = String(req.query.email || '').trim().toLowerCase()
  const token = String(req.query.token || '')

  const kv = getRedis()
  if (!kv || !email || email.length > 254 || !TOKEN_PATTERN.test(token)) return redirect('error')

  try {
    const stored = await kv.hget<string>(CONFIRMED_KEY, email)
    if (!stored || !safeEqual(stored, token)) return redirect('error')

    await kv.hdel(CONFIRMED_KEY, email)
    await kv.hdel(PENDING_KEY, email)
    await kv.hdel(SYNCKEY_KEY, email)
    await kv.hdel(ALERTS_PREFS_KEY, email)
    await kv.hdel(ALERTS_NOTIFIED_KEY, email)
    await kv.hdel(TRAKT_KEY, email)
    await kv.hdel(DISCORD_KEY, email)
    await kv.hdel(TELEGRAM_KEY, email)
    await kv.hdel(PUSH_KEY, email)
    await kv.hdel(CHAT_HISTORY_KEY, email)
    const shareId = await kv.hget<string>(SHARE_KEY, email)
    if (shareId) {
      await kv.hdel(SHARE_KEY, email)
      await kv.hdel(SHARE_LOOKUP_KEY, shareId)
    }
    return redirect('unsubscribed')
  } catch (err) {
    console.error('Waitlist remove error:', err)
    return redirect('error')
  }
}
