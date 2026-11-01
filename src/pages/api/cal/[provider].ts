import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, setApiCache } from '../../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../../lib/rateLimiter'
import { getProviderChanges, getMonthlyChanges } from '../../../features/catalog/streamingChanges'
import { PROVIDER_NAME_MATCH, streamingProviders } from '../../../features/catalog/tmdb'
import { buildIcs, publicProviderEvents } from '../../../features/alerts/calendar'

// Unauthenticated per-provider calendar: "everything leaving Netflix" as an
// ICS feed anyone can subscribe to — the free counterpart to the Plus-only
// personal watchlist calendar in /api/calendar.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  // No rejectBot: calendar apps fetch with their own UAs (same as /api/calendar).

  const slug = String(Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider || '')
    .replace(/\.ics$/i, '')
  const provider = streamingProviders[slug]
  if (!provider || !PROVIDER_NAME_MATCH[slug]) return res.status(404).send('Unknown provider')

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'cal_pub_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).send('Too many attempts. Please try again later.')
  }

  const label = provider.title.replace(/ Movies$/, '')
  try {
    const [changes, monthly] = await Promise.all([
      getProviderChanges([slug]),
      getMonthlyChanges([slug])
    ])
    const events = publicProviderEvents(slug, changes[slug], monthly[slug])

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    setApiCache(res, 3600, 86400)
    res.status(200).send(buildIcs(events, `${label} arrivals & departures — Galaxy Movies`))
  } catch (err) {
    console.error('Public calendar feed error:', err)
    res.status(500).send('Could not build calendar')
  }
}
