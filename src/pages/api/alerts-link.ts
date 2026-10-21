import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, SYNCKEY_KEY } from '../../features/alerts/waitlistStore'
import { safeEqual } from '../../lib/auth'
import { requireMethod } from '../../lib/http'

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

    const fragment = `email=${encodeURIComponent(email)}&key=${key}`
    // Same whitelisted hand-off as waitlist-confirm — /plus signups land back
    // on the plan picker instead of the email-status page.
    if (req.query.next === 'plus') {
      return res.redirect(302, `/plus?status=confirmed#${fragment}`)
    }
    return redirect('confirmed', fragment)
  } catch (err) {
    console.error('Alerts link error:', err)
    return redirect('error')
  }
}
