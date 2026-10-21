import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, PENDING_KEY, CONFIRMED_KEY, getOrCreateSyncKey } from '../../features/alerts/waitlistStore'
import { safeEqual } from '../../lib/auth'
import { requireMethod } from '../../lib/http'

const TOKEN_PATTERN = /^[0-9a-f-]{36}$/i

// No bot check or rate limit here on purpose: mail clients prefetch links in
// emails, so the first "click" is often a scanner — the token is the auth.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const redirect = (status: string, fragment?: string) =>
    res.redirect(302, `/email-status?status=${status}${fragment ? `#${fragment}` : ''}`)

  if (!requireMethod(req, res, 'GET')) return

  const email = String(req.query.email || '').trim().toLowerCase()
  const token = String(req.query.token || '')

  const kv = getRedis()
  if (!kv || !email || email.length > 254 || !TOKEN_PATTERN.test(token)) return redirect('error')

  try {
    const stored = await kv.hget<string>(PENDING_KEY, email)
    if (!stored || !safeEqual(stored, token)) return redirect('error')

    await kv.hset(CONFIRMED_KEY, { [email]: token })
    await kv.hdel(PENDING_KEY, email)

    // Fragment never reaches the server on redirect follow, so the sync
    // credential stays out of access logs from this point on.
    const syncKey = await getOrCreateSyncKey(kv, email)
    const fragment = `email=${encodeURIComponent(email)}&key=${syncKey}`
    // Signups started on /plus land back there already authed — the plan
    // picker is the next step, not the email-status page. Whitelisted value
    // only, so `next` can't become an open redirect.
    if (req.query.next === 'plus') {
      return res.redirect(302, `/plus?status=confirmed#${fragment}`)
    }
    return redirect('confirmed', fragment)
  } catch (err) {
    console.error('Waitlist confirm error:', err)
    return redirect('error')
  }
}
