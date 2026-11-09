import type { NextApiRequest, NextApiResponse } from 'next'
import { requireMethod, setApiCache } from '../../../lib/http'
import { getClientIP, checkDistributedRateLimit } from '../../../lib/rateLimiter'
import { getProviderChanges, getMonthlyChanges } from '../../../features/catalog/streamingChanges'
import { embeddableProviders, isEmbeddableProvider, providerLabel } from '../../../features/catalog/embed'
import { buildRss, providerRssItems } from '../../../features/catalog/rss'
import { SITE_URL } from '../../../lib/site'

// Unauthenticated per-provider RSS feed: "everything new & leaving Netflix" for
// RSS readers, IFTTT/Zapier triggers, and rss-to-email/Telegram bridges — the
// per-service counterpart to /leaving.xml and /api/cal/[provider].
const DESCRIPTION =
  'Daily-tracked arrivals, departures and announced releases. Powered by Galaxy Movies — keep attribution when republishing.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return
  // No rejectBot: feed readers fetch with their own UAs (same as /api/cal/*).

  const slug = String(Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider || '')
    .replace(/\.xml$/i, '')
  const isAll = slug === 'all'
  if (!isAll && !isEmbeddableProvider(slug)) return res.status(404).send('Unknown provider')

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'rss_rl',
    maxRequests: 60,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    return res.status(429).send('Too many attempts. Please try again later.')
  }

  const keys = isAll ? embeddableProviders().map((p) => p.key) : [slug]
  try {
    const [changes, monthly] = await Promise.all([getProviderChanges(keys), getMonthlyChanges(keys)])
    const items = keys.flatMap((key) => providerRssItems(key, changes[key], monthly[key]))
    items.sort((a, b) => b.pubDate - a.pubDate)

    const label = isAll ? 'All services' : providerLabel(slug)
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    setApiCache(res, 3600, 86400)
    res.status(200).send(
      buildRss(items.slice(0, 50), {
        title: `${label} arrivals & departures — Galaxy Movies`,
        link: isAll ? `${SITE_URL}/leaving` : `${SITE_URL}/leaving/${slug}`,
        description: DESCRIPTION,
        self: `${SITE_URL}/api/rss/${slug}`
      })
    )
  } catch (err) {
    console.error('RSS feed error:', err)
    res.status(500).send('Could not build feed')
  }
}
