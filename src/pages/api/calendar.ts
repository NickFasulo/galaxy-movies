import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, setApiCache } from '../../lib/api'
import { getClientIP, checkDistributedRateLimit } from '../../lib/rateLimiter'
import { getLinkedEmail, getBillingRecord, isPlusActive } from '../../features/billing/billing'
import { getRedis, ALERTS_PREFS_KEY } from '../../features/alerts/waitlistStore'
import { getProviderChanges, IN_TRACKED_PROVIDERS } from '../../features/catalog/streamingChanges'
import { PROVIDER_NAME_MATCH } from '../../features/catalog/tmdb'
import { parsePrefs } from '../../features/alerts/watchlistAlerts'
import { buildIcs, comingEvents, episodeEvents, premiereEvents, loadUpcomingEpisodes, loadUpcomingPremieres } from '../../features/alerts/calendar'

// Calendar clients poll on their own schedule (every few hours); the per-URL
// CDN cache plus the 10-minute changes memo keep repeat polls off Redis.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  // No rejectBot: calendar apps fetch with their own UAs (e.g. okhttp, python).

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'calendar_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' })
  }

  const email = await getLinkedEmail(req)
  if (!email) {
    return res.status(403).send('Invalid credentials')
  }
  if (!isPlusActive(await getBillingRecord(email))) {
    return res.status(403).send('Galaxy Plus is required')
  }

  const kv = getRedis()
  if (!kv) {
    return res.status(503).send('Calendar is temporarily unavailable')
  }

  try {
    const prefs = parsePrefs(await kv.hget(ALERTS_PREFS_KEY, email))
    const region = prefs?.region === 'IN' ? 'IN' : 'US'
    const tracked = region === 'IN' ? IN_TRACKED_PROVIDERS : Object.keys(PROVIDER_NAME_MATCH)
    const services = prefs?.services.filter((key) => tracked.includes(key)) || []
    const changes = services.length ? await getProviderChanges(services, { region }) : {}
    const tvIds = (prefs?.watchlist || []).filter((w) => w.mediaType === 'tv').map((w) => w.id)
    const movieIds = (prefs?.watchlist || []).filter((w) => w.mediaType === 'movie').map((w) => w.id)
    const [episodes, premieres] = await Promise.all([
      loadUpcomingEpisodes(tvIds),
      loadUpcomingPremieres(movieIds, region)
    ])
    const events = prefs
      ? [...comingEvents(prefs, changes), ...episodeEvents(prefs, episodes), ...premiereEvents(prefs, premieres)]
      : []

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    setApiCache(res, 3600, 86400)
    res.status(200).send(buildIcs(events))
  } catch (err) {
    console.error('Calendar feed error:', err)
    res.status(500).send('Could not build calendar')
  }
}
