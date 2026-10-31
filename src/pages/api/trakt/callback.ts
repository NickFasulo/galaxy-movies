import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod } from '../../../lib/http'
import { getRedis, SYNCKEY_KEY, TRAKT_KEY } from '../../../features/alerts/waitlistStore'
import { safeEqual } from '../../../lib/auth'
import { consumePkceSession, exchangeCode, traktConfigured } from '../../../features/billing/trakt'
import { traktRedirectUri } from './connect'
import { firstParam } from '../../../lib/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return

  const fail = (reason: string) => res.redirect(`/watchlist?trakt=${reason}`)
  if (!traktConfigured()) return fail('error')

  const code = firstParam(req.query.code)
  const session = await consumePkceSession(String(firstParam(req.query.state) || ''))
  if (!code || !session) {
    console.error('Trakt callback: missing code or PKCE session', { hasCode: Boolean(code), hasSession: Boolean(session) })
    return fail('error')
  }

  const kv = getRedis()
  if (!kv) return fail('error')

  try {
    // The session proves the user clicked connect; this confirms the credential
    // it carries is still the live sync key (it could have rotated mid-flow).
    const stored = await kv.hget<string>(SYNCKEY_KEY, session.email)
    if (!stored || !safeEqual(stored, session.key)) return fail('error')

    const tokens = await exchangeCode(code, traktRedirectUri, session.verifier)
    if (!tokens?.refresh_token) return fail('error')

    await kv.hset(TRAKT_KEY, { [session.email]: { refreshToken: tokens.refresh_token } })
    res.redirect('/watchlist?trakt=connected')
  } catch (err) {
    console.error('Trakt callback error:', err)
    fail('error')
  }
}
