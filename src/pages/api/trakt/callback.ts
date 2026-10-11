import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod } from '../../../utils/api'
import { getRedis, SYNCKEY_KEY, TRAKT_KEY } from '../../../utils/waitlistStore'
import { safeEqual } from '../../../utils/auth'
import { exchangeCode, traktConfigured, verifyState } from '../../../utils/trakt'
import { traktRedirectUri } from './connect'
import { firstParam } from '../../../utils/query'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return

  const fail = (reason: string) => res.redirect(`/watchlist?trakt=${reason}`)
  if (!traktConfigured()) return fail('error')

  const code = firstParam(req.query.code)
  const creds = verifyState(String(firstParam(req.query.state) || ''))
  if (!code || !creds) return fail('error')

  const kv = getRedis()
  if (!kv) return fail('error')

  try {
    // State proves the user clicked connect; this confirms the credential it
    // carries is still the live sync key (it could have rotated mid-flow).
    const stored = await kv.hget<string>(SYNCKEY_KEY, creds.email)
    if (!stored || !safeEqual(stored, creds.key)) return fail('error')

    const tokens = await exchangeCode(code, traktRedirectUri)
    if (!tokens?.refresh_token) return fail('error')

    await kv.hset(TRAKT_KEY, { [creds.email]: { refreshToken: tokens.refresh_token } })
    res.redirect('/watchlist?trakt=connected')
  } catch (err) {
    console.error('Trakt callback error:', err)
    fail('error')
  }
}
