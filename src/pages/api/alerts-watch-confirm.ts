import type { NextApiRequest, NextApiResponse } from 'next'
import { getRedis, WATCH_KEY, WATCH_PENDING_KEY } from '../../features/alerts/waitlistStore'
import { mergeWatchTitles, parseWatchEntry, type WatchTitle } from '../../features/alerts/titleAlerts'
import { safeEqual } from '../../lib/auth'
import { requireMethod } from '../../lib/api'
import { randomUUID } from 'crypto'

const TOKEN_PATTERN = /^[0-9a-f-]{36}$/i

interface WatchPending {
  token: string
  titles: WatchTitle[]
}

// Same shape as waitlist-confirm: no bot check or rate limit because mail
// clients prefetch email links — the token is the auth.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const redirect = (status: string) => res.redirect(302, `/email-status?status=${status}`)

  if (!requireMethod(req, res, 'GET')) return

  const email = String(req.query.email || '').trim().toLowerCase()
  const token = String(req.query.token || '')

  const kv = getRedis()
  if (!kv || !email || email.length > 254 || !TOKEN_PATTERN.test(token)) return redirect('error')

  try {
    const pending = await kv.hget<WatchPending>(WATCH_PENDING_KEY, email)
    if (!pending || !safeEqual(pending.token, token)) return redirect('error')

    const existing = parseWatchEntry(await kv.hget(WATCH_KEY, email))
    let titles = existing?.titles || []
    for (const t of pending.titles || []) {
      titles = mergeWatchTitles(titles, t)
    }

    await kv.hset(WATCH_KEY, { [email]: { unsub: existing?.unsub || randomUUID(), titles } })
    await kv.hdel(WATCH_PENDING_KEY, email)
    return redirect('watch-confirmed')
  } catch (err) {
    console.error('Title watch confirm error:', err)
    return redirect('error')
  }
}
