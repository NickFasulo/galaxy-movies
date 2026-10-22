import type { NextApiRequest, NextApiResponse } from 'next'
import { getProviderChanges } from '../../features/catalog/streamingChanges'
import { PROVIDER_NAME_MATCH } from '../../features/catalog/tmdb'
import { BROADCAST_LINK, BROADCAST_PROVIDERS, buildDeparturesDigest, buildRedditDigest, providerLabel } from '../../features/social/socialBroadcast'
import { checkPublicDigestLimit } from '../../lib/rateLimiter'

// Public read-only payload the Devvit app polls on its weekly schedule.
// Contains only already-public digest content; `key` lets the caller dedupe
// without comparing bodies. Rate-limited but no UA check — the Devvit
// fetcher isn't a browser. `?providers=` scopes the digest to a sub's
// configured services (validated against the US diff set); omitted = all
// broadcast providers, which keeps unconfigured installs on the old format.
// `?kind=leaving` returns the departures-only digest (month-scoped key) the
// Devvit monthly task posts; any other value is the weekly digest.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await checkPublicDigestLimit(req))) {
    return res.status(429).json({ error: 'Rate limit reached. Please try again later.' })
  }

  const raw = typeof req.query.providers === 'string' ? req.query.providers : ''
  const providers = (raw ? raw.split(',') : BROADCAST_PROVIDERS)
    .map((p) => p.trim())
    .filter((key) => PROVIDER_NAME_MATCH[key])
  if (!providers.length) return res.status(400).json({ error: 'no valid providers' })

  const leaving = req.query.kind === 'leaving'

  try {
    const changes = await getProviderChanges(providers)
    if (!Object.keys(changes).length) return res.status(503).json({ error: 'no changes data' })

    const text = leaving ? buildDeparturesDigest(changes, providers, 10000) : buildRedditDigest(changes, providers, 10000)
    if (text.length < 40) return res.status(503).json({ error: 'nothing to post' })

    const now = new Date()
    const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const week = Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7)
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({
      title: leaving
        ? providers.length === 1
          ? `Leaving ${providerLabel(providers[0])} soon: this month's departures`
          : "Leaving soon on streaming: this month's departures"
        : providers.length === 1
          ? `This week on ${providerLabel(providers[0])}: new arrivals & departures`
          : "This week's streaming moves: new arrivals & departures",
      text,
      url: BROADCAST_LINK,
      key: leaving
        ? `${month}:leaving:${providers.join('+')}`
        : `${now.getUTCFullYear()}-W${week}:${providers.join('+')}`
    })
  } catch (err) {
    console.error('reddit-payload failed:', err)
    return res.status(500).json({ error: 'payload failed' })
  }
}
