import type { NextApiRequest, NextApiResponse } from 'next'
import { getProviderChanges, type ProviderChanges } from '../../utils/catalog/streamingChanges'
import { embeddableProviders, isEmbeddableProvider, providerLabel } from '../../utils/catalog/embed'
import { getClientIP, checkDistributedRateLimit } from '../../utils/core/rateLimiter'
import { requireMethod, setApiCache } from '../../utils/core/api'
import { SITE_URL } from '../../utils/core/site'

function serialize(provider: string, change: ProviderChanges) {
  return {
    provider,
    source: change.source,
    updatedAt: change.updatedAt,
    coming: change.coming,
    added: change.added,
    left: change.left,
    attribution: {
      text: 'Powered by Galaxy Movies',
      url: `${SITE_URL}/leaving/${provider}`
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!requireMethod(req, res, 'GET')) return
  // No rejectBot here: this feed is deliberately public (docs show curl), and it
  // costs no upstream calls — the memoized Redis read + rate limit is the guard.

  const rawProvider = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider
  const provider = (rawProvider || '').toLowerCase()
  if (!provider) {
    return res.status(400).json({
      error: 'provider query param is required',
      example: `${SITE_URL}/api/streaming-changes?provider=netflix`,
      providers: embeddableProviders().map((p) => p.key)
    })
  }

  const allowed = await checkDistributedRateLimit(getClientIP(req), {
    keyPrefix: 'changes_rl',
    maxRequests: 120,
    windowSeconds: 60 * 60
  })
  if (!allowed) {
    res.setHeader('Retry-After', '3600')
    return res.status(429).json({ error: 'Too many requests. Please try again later.' })
  }

  if (provider === 'all') {
    const keys = embeddableProviders().map((p) => p.key)
    const changes = await getProviderChanges(keys)
    const providers: Record<string, ReturnType<typeof serialize> & { label: string }> = {}
    for (const key of keys) {
      if (changes[key]) providers[key] = { label: providerLabel(key), ...serialize(key, changes[key]) }
    }
    setApiCache(res, 3600, 86400)
    return res.status(200).json({ providers })
  }

  if (!isEmbeddableProvider(provider)) {
    return res.status(404).json({
      error: `Unknown provider '${provider}'`,
      providers: embeddableProviders().map((p) => p.key)
    })
  }

  const change = (await getProviderChanges([provider]))[provider]
  if (!change) return res.status(503).json({ error: 'Change data temporarily unavailable' })

  setApiCache(res, 3600, 86400)
  return res.status(200).json({ label: providerLabel(provider), ...serialize(provider, change) })
}
