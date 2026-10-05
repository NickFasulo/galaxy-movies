import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, PENDING_KEY, CONFIRMED_KEY } from '../../utils/waitlistStore'
import { safeEqual } from '../../utils/auth'

const TOKEN_PATTERN = /^[0-9a-f-]{36}$/i

// No bot check or rate limit here on purpose: mail clients prefetch links in
// emails, so the first "click" is often a scanner — the token is the auth.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const redirect = (status: string) => res.redirect(302, `/email-status?status=${status}`)

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const email = String(req.query.email || '').trim().toLowerCase()
  const token = String(req.query.token || '')

  const kv = getRedis()
  if (!kv || !email || email.length > 254 || !TOKEN_PATTERN.test(token)) return redirect('error')

  try {
    const stored = await kv.hget<string>(PENDING_KEY, email)
    if (!stored || !safeEqual(stored, token)) return redirect('error')

    await kv.hset(CONFIRMED_KEY, { [email]: token })
    await kv.hdel(PENDING_KEY, email)
    return redirect('confirmed')
  } catch (err) {
    console.error('Waitlist confirm error:', err)
    return redirect('error')
  }
}
