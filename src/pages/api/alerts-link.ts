import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, SYNCKEY_KEY } from '../../utils/waitlistStore'
import { safeEqual } from '../../utils/auth'
import { requireMethod } from '../../utils/api'

const KEY_PATTERN = /^[0-9a-f-]{36}$/i

// No bot check or rate limit — same reasoning as waitlist-confirm/-remove:
// mail clients prefetch links, and the key itself is the auth.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const redirect = (status: string, fragment?: string) =>
    res.redirect(302, `/email-status?status=${status}${fragment ? `#${fragment}` : ''}`)

  if (!requireMethod(req, res, 'GET')) return

  const email = String(req.query.email || '').trim().toLowerCase()
  const key = String(req.query.key || '')

  const kv = getRedis()
  if (!kv || !email || email.length > 254 || !KEY_PATTERN.test(key)) return redirect('error')

  try {
    const stored = await kv.hget<string>(SYNCKEY_KEY, email)
    if (!stored || !safeEqual(stored, key)) return redirect('error')

    return redirect('confirmed', `email=${encodeURIComponent(email)}&key=${key}`)
  } catch (err) {
    console.error('Alerts link error:', err)
    return redirect('error')
  }
}
