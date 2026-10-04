const { getRedis, PENDING_KEY, CONFIRMED_KEY } = require('../../utils/waitlistStore')
const { safeEqual } = require('../../utils/auth')

const TOKEN_PATTERN = /^[0-9a-f-]{36}$/i

// No bot check or rate limit — mail clients prefetch links; the token is the auth.
export default async function handler(req, res) {
  const redirect = (status) => res.redirect(302, `/email-status?status=${status}`)

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).end(`Method ${req.method} Not Allowed`)
  }

  const email = String(req.query.email || '').trim().toLowerCase()
  const token = String(req.query.token || '')

  const kv = getRedis()
  if (!kv || !email || email.length > 254 || !TOKEN_PATTERN.test(token)) return redirect('error')

  try {
    const stored = await kv.hget(CONFIRMED_KEY, email)
    if (!stored || !safeEqual(stored, token)) return redirect('error')

    await kv.hdel(CONFIRMED_KEY, email)
    await kv.hdel(PENDING_KEY, email)
    return redirect('unsubscribed')
  } catch (err) {
    console.error('Waitlist remove error:', err)
    return redirect('error')
  }
}
